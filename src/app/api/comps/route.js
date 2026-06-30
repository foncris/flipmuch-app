import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const RENTCAST_AVM_BASE = "https://api.rentcast.io/v1/avm/value";
const RENTCAST_RECORDS_BASE = "https://api.rentcast.io/v1/properties";
const DEFAULT_COMP_LIMIT = 3;
const MAX_COMP_LIMIT = 10;
// Safety cap on how many distinct addresses we'll ever ask Property Records
// about in one request. RentCast's AVM comp pool is already capped at 25
// (compCount below), so this should rarely if ever bind — it just protects
// against a pathological response.
const MAX_CANDIDATES_TO_VERIFY = 30;
// County deed recording typically lags the actual closing by a few weeks, so
// a sale recorded slightly outside the nominal search window is still valid.
const SALE_RECORDING_GRACE_DAYS = 45;
// Address fragments that strongly signal a condo/townhouse unit (e.g. "Unit
// 18AB", "Apt 802", "#304", "PH2") regardless of whatever propertyType field
// RentCast did or didn't attach to that comp record.
const UNIT_ADDRESS_PATTERN = /\b(unit|apt|apartment|#|ph\d|fl\s?\d{1,2}\b)/i;

function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Normalizes RentCast's various property-type strings into a small set of
// buckets so a subject's actual housing type can be enforced strictly.
function normalizePropertyType(type) {
  if (!type) return null;
  const t = String(type).toLowerCase();
  if (t.includes("single")) return "single-family";
  if (t.includes("condo")) return "condo";
  if (t.includes("town")) return "townhouse";
  if (t.includes("multi")) return "multi-family";
  if (t.includes("manufactured") || t.includes("mobile")) return "manufactured";
  if (t.includes("land")) return "land";
  return t;
}

// Pulls candidate comparable properties for a subject address from
// RentCast's AVM endpoint. RentCast's comp engine already ranks results by
// similarity (the "correlation" field) using beds/baths/sqft signals it has
// on file for each property — but its own comparable records only ever
// distinguish a listing `status` of "Active" or "Inactive" (when present at
// all). "Inactive" does NOT mean sold — it can also mean withdrawn, expired,
// canceled, or under contract/pending a closing (e.g. "accepting backup
// offers"). So this endpoint alone is treated as a CANDIDATE pool, never as
// confirmed sold comps — see saleWithinWindow() below for the actual sale
// confirmation step, which is the only thing that actually counts.
async function fetchRentCastComps({ address, bedrooms, bathrooms, squareFootage, propertyType, maxRadius, daysOld }) {
  const params = new URLSearchParams({ address, compCount: "25" });
  if (propertyType) params.set("propertyType", propertyType);
  if (bedrooms) params.set("bedrooms", String(bedrooms));
  if (bathrooms) params.set("bathrooms", String(bathrooms));
  if (squareFootage) params.set("squareFootage", String(squareFootage));
  if (maxRadius) params.set("maxRadius", String(maxRadius));
  if (daysOld) params.set("daysOld", String(daysOld));

  const res = await fetch(`${RENTCAST_AVM_BASE}?${params.toString()}`, {
    headers: { "X-Api-Key": process.env.RENTCAST_API_KEY },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RentCast ${res.status}: ${text.slice(0, 300) || res.statusText}`);
  }
  return res.json();
}

async function fetchPropertyRecord(address) {
  try {
    const params = new URLSearchParams({ address });
    const res = await fetch(`${RENTCAST_RECORDS_BASE}?${params.toString()}`, {
      headers: { "X-Api-Key": process.env.RENTCAST_API_KEY },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data[0] || null : data || null;
  } catch {
    return null;
  }
}

// Checks a previously-fetched Property Records entry for an ACTUAL recorded
// deed sale that falls inside the given recency window. This is the only
// thing in this route that confirms a closing — everything else (a listing
// going "Inactive", a status string like "Pending" or "Accepting Backup
// Offers", a removedDate) is just a signal that a property left the active
// market, NOT proof it sold. A property that's under contract, withdrawn,
// expired, or canceled will correctly fail this check and get excluded.
function saleWithinWindow(record, maxDaysOld) {
  if (!record?.lastSaleDate || !record?.lastSalePrice) return null;
  if (maxDaysOld) {
    const ageDays = (Date.now() - new Date(record.lastSaleDate).getTime()) / 86400000;
    if (ageDays > maxDaysOld + SALE_RECORDING_GRACE_DAYS) return null;
  }
  return { saleDate: record.lastSaleDate, salePrice: record.lastSalePrice };
}

export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  if (!process.env.RENTCAST_API_KEY) {
    return NextResponse.json(
      { error: "Comps lookup isn't configured yet — missing RENTCAST_API_KEY." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address")?.trim();
  if (!address) {
    return NextResponse.json({ error: "Address is required." }, { status: 400 });
  }

  const bedrooms = searchParams.get("beds") || undefined;
  const bathrooms = searchParams.get("baths") || undefined;
  const squareFootage = searchParams.get("sqft") || undefined;
  const propertyType = searchParams.get("propertyType") || "Single Family";
  const subjectType = normalizePropertyType(propertyType);

  const subjSqft = squareFootage ? Number(squareFootage) : null;
  const subjBeds = bedrooms ? Number(bedrooms) : null;
  const subjBaths = bathrooms ? Number(bathrooms) : null;

  const requestedLimit = Number(searchParams.get("limit"));
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(Math.round(requestedLimit), MAX_COMP_LIMIT)
    : DEFAULT_COMP_LIMIT;

  // A comp is disqualified if it's a different housing type than the
  // subject — checked two ways since RentCast's own propertyType field
  // isn't always populated on every comp record: (1) the field itself, and
  // (2) the address literally reading like a condo/townhouse unit (e.g.
  // "Unit 18AB", "Apt 802", "#304").
  function isSameType(c) {
    if (!subjectType) return true;
    const fieldType = normalizePropertyType(c.propertyType);
    if (fieldType && fieldType !== subjectType) return false;
    if (subjectType === "single-family" && UNIT_ADDRESS_PATTERN.test(c.formattedAddress || c.addressLine1 || "")) {
      return false;
    }
    return true;
  }

  // Cheap pre-filter: if RentCast happens to have populated `status`,
  // exclude anything explicitly flagged "Active" before we even bother
  // looking it up in Property Records. This is NOT the decisive check —
  // RentCast's status field is sparse/unreliable and doesn't expose
  // "Pending"/"Under Contract"/"Accepting Backup Offers" as distinct values,
  // so a not-yet-closed property can still slip past this filter. The real
  // gate is saleWithinWindow() below, against actual county deed records.
  function isOffMarket(c) {
    return c.status !== "Active";
  }

  function addressOf(c) {
    return c.formattedAddress || [c.addressLine1, c.city, c.state].filter(Boolean).join(", ");
  }

  // Widen the net in stages: tight + recent first (90 days / 1.5 mi), then
  // relax distance, then relax recency, up to 2 mi / 365 days (12 months).
  // Per appraiser policy, "enough" means enough CONFIRMED CLOSED sales that
  // also match the subject's housing type — a bigger pool of unconfirmed,
  // pending, or wrong-type properties doesn't count, and there is no
  // fallback to anything less than a confirmed sale at any stage.
  const attempts = [
    { maxRadius: 1.5, daysOld: 90 },
    { maxRadius: 1.5, daysOld: 180 },
    { maxRadius: 2, daysOld: 180 },
    { maxRadius: 2, daysOld: 365 },
  ];

  // Cache raw Property Records lookups by address across attempts — later,
  // wider attempts mostly re-include the same nearby candidates, so this
  // avoids re-fetching a record (and its lastSaleDate/lastSalePrice) more
  // than once per address for the whole request.
  const recordCache = new Map();
  async function getCachedPropertyRecord(addr) {
    if (recordCache.has(addr)) return recordCache.get(addr);
    const record = await fetchPropertyRecord(addr);
    recordCache.set(addr, record);
    return record;
  }

  let verifiedComps = null;
  let rawEligibleCount = 0;
  let usedAttempt = null;
  let lastError = null;

  for (const attempt of attempts) {
    try {
      const data = await fetchRentCastComps({ address, bedrooms, bathrooms, squareFootage, propertyType, ...attempt });
      const comps = data?.comparables || [];
      const eligible = comps.filter((c) => isSameType(c) && isOffMarket(c));
      const toCheck = eligible.slice(0, MAX_CANDIDATES_TO_VERIFY);

      const records = await Promise.all(
        toCheck.map((c) => getCachedPropertyRecord(addressOf(c)).catch(() => null))
      );

      const built = toCheck
        .map((c, i) => {
          const verification = saleWithinWindow(records[i], attempt.daysOld);
          if (!verification) return null; // not a confirmed closed sale — drop it, no exceptions
          const price = verification.salePrice;
          const sqft = c.squareFootage ?? null;
          if (!price || !sqft) return null;
          return {
            address: addressOf(c),
            distance: c.distance != null ? Number(Number(c.distance).toFixed(2)) : null,
            beds: c.bedrooms ?? null,
            baths: c.bathrooms ?? null,
            sqft,
            price,
            pricePerSqft: price / sqft,
            lotSize: c.lotSize ?? null,
            yearBuilt: c.yearBuilt ?? null,
            soldDate: verification.saleDate,
            verified: true,
            correlation: c.correlation ?? null,
          };
        })
        .filter(Boolean);

      const isLastAttempt = attempt === attempts[attempts.length - 1];
      if (built.length >= limit || isLastAttempt) {
        verifiedComps = built;
        rawEligibleCount = eligible.length;
        usedAttempt = attempt;
        break;
      }
      // Not enough confirmed sales yet at this radius/recency — widen and
      // try again rather than settling for fewer-than-requested comps too
      // early.
    } catch (err) {
      lastError = err;
      // Keep trying wider searches — a bad geocode at a tight radius can
      // still succeed once the query relaxes.
    }
  }

  if (!verifiedComps) {
    return NextResponse.json(
      { error: lastError?.message || "No comparable sales found for this address." },
      { status: 404 }
    );
  }

  // Fix-and-flip ARV comps need to reflect POST-renovation value, not just
  // any nearby sale. RentCast's AVM doesn't expose a literal "renovated"
  // flag, so we use price/sqft relative to the (confirmed-sold, type-
  // matched) comp pool as the proxy: properties that sold well above the
  // pool's median $/sqft are almost always the updated/flipped resales.
  const medianPricePerSqft = median(verifiedComps.map((c) => c.pricePerSqft).filter(Boolean));

  // Rank by how closely each comp matches the SUBJECT's own sqft/beds/full
  // baths — this is what keeps a 3,500 sf / 5-bed / 5-bath house from being
  // "matched" against smaller or differently-configured homes just because
  // they're nearby. Likely-renovated comps get a small tiebreak bonus since
  // they better represent the subject's post-rehab condition.
  const scored = verifiedComps.map((c) => {
    const sqftDiffPct = subjSqft && c.sqft ? Math.abs(c.sqft - subjSqft) / subjSqft : 0;
    const bedsDiff = subjBeds != null && c.beds != null ? Math.abs(c.beds - subjBeds) : 0;
    const bathsDiff = subjBaths != null && c.baths != null ? Math.abs(c.baths - subjBaths) : 0;
    const likelyRenovated = medianPricePerSqft ? c.pricePerSqft >= medianPricePerSqft : null;
    const similarityScore =
      sqftDiffPct * 100 +        // ~1 pt per 1% sqft difference from subject
      bedsDiff * 15 +            // 15 pts per bedroom off
      bathsDiff * 12 +           // 12 pts per full bath off
      (c.distance || 0) * 1.5 -  // small nudge toward closer comps
      (likelyRenovated ? 4 : 0); // small nudge toward likely-updated resales
    return { ...c, likelyRenovated, similarityScore };
  });

  const finalComps = scored
    .sort((a, b) => a.similarityScore - b.similarityScore)
    .slice(0, limit)
    .map(({ similarityScore, ...c }) => c);

  return NextResponse.json({
    comps: finalComps,
    suggestedArv:
      finalComps.length && finalComps.every((c) => c.pricePerSqft) && subjSqft
        ? Math.round(
            (finalComps.reduce((sum, c) => sum + c.pricePerSqft, 0) / finalComps.length) * subjSqft
          )
        : null,
    radiusUsed: usedAttempt?.maxRadius ?? null,
    daysOldUsed: usedAttempt?.daysOld ?? null,
    medianPricePerSqft,
    compsConsidered: rawEligibleCount,
    verifiedCount: finalComps.length,
    requestedLimit: limit,
  });
}
