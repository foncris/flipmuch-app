import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const RENTCAST_AVM_BASE = "https://api.rentcast.io/v1/avm/value";
const RENTCAST_RECORDS_BASE = "https://api.rentcast.io/v1/properties";
const DEFAULT_COMP_LIMIT = 3;
const MAX_COMP_LIMIT = 10;
// Hard cap on Property Records lookups per request across ALL escalation
// stages combined. In the best case (first `limit` candidates are all
// confirmed sold) we make exactly `limit` calls; this cap protects against
// worst-case areas with very few actual closings where we'd otherwise chase
// every candidate in the pool.
const MAX_TOTAL_VERIFICATIONS = 20;
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

// Checks a Property Records entry for an ACTUAL recorded deed sale inside
// the given recency window. Properties under contract, withdrawn, expired,
// or pending fail this check. Only a recorded lastSaleDate + lastSalePrice
// counts as a confirmed closed sale.
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
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!process.env.RENTCAST_API_KEY) {
    return NextResponse.json(
      { error: "Comps lookup isn't configured yet — missing RENTCAST_API_KEY." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address")?.trim();
  if (!address) return NextResponse.json({ error: "Address is required." }, { status: 400 });

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

  function isSameType(c) {
    if (!subjectType) return true;
    const fieldType = normalizePropertyType(c.propertyType);
    if (fieldType && fieldType !== subjectType) return false;
    if (subjectType === "single-family" && UNIT_ADDRESS_PATTERN.test(c.formattedAddress || c.addressLine1 || "")) return false;
    return true;
  }

  // Cheap pre-filter: exclude anything RentCast explicitly labels Active.
  // This is not the decisive sold-check (status field is sparse/unreliable)
  // — saleWithinWindow() against county deed records is the real gate.
  function isOffMarket(c) { return c.status !== "Active"; }

  function addressOf(c) {
    return c.formattedAddress || [c.addressLine1, c.city, c.state].filter(Boolean).join(", ");
  }

  // Pre-score candidates by similarity to the subject BEFORE spending API
  // calls on Property Records lookups. We verify in best-first order and
  // stop the moment we have `limit` confirmed sales — so for a typical
  // search with 3–5 verified sales near the subject specs we only make
  // 3–5 Property Records calls instead of verifying all 25 AVM candidates.
  function quickScore(c) {
    const sqftDiff = subjSqft && c.squareFootage ? Math.abs(c.squareFootage - subjSqft) / subjSqft : 0;
    const bedsDiff = subjBeds != null && c.bedrooms != null ? Math.abs(c.bedrooms - subjBeds) : 0;
    const bathsDiff = subjBaths != null && c.bathrooms != null ? Math.abs(c.bathrooms - subjBaths) : 0;
    return sqftDiff * 100 + bedsDiff * 15 + bathsDiff * 12 + (c.distance || 0) * 1.5;
  }

  // Escalation ladder: tight + recent first, widen radius/recency until we
  // have `limit` confirmed sales. Extends to 24 months (730 days) for thin
  // markets — a seasoned comp is better than no comp, and the UI will
  // surface exactly how far back the search had to reach.
  const attempts = [
    { maxRadius: 1.5, daysOld: 90  },
    { maxRadius: 1.5, daysOld: 180 },
    { maxRadius: 2,   daysOld: 180 },
    { maxRadius: 2,   daysOld: 365 },
    { maxRadius: 2,   daysOld: 730 },
    { maxRadius: 3,   daysOld: 730 },
  ];

  // Cache Property Records lookups across all escalation stages — if a
  // candidate appears again in a wider search, we reuse the cached record
  // instead of making another API call.
  const recordCache = new Map();
  let verificationCount = 0;

  async function getCachedPropertyRecord(addr) {
    if (recordCache.has(addr)) return recordCache.get(addr);
    if (verificationCount >= MAX_TOTAL_VERIFICATIONS) return null; // budget exhausted
    verificationCount++;
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

      // Sort by spec-similarity BEFORE verifying so we call Property Records
      // on the most-likely-to-qualify candidates first and stop early.
      const sorted = eligible.slice().sort((a, b) => quickScore(a) - quickScore(b));

      const built = [];
      for (const c of sorted) {
        if (built.length >= limit) break;
        const addr = addressOf(c);
        const record = await getCachedPropertyRecord(addr);
        const verification = saleWithinWindow(record, attempt.daysOld);
        if (!verification) continue;
        const price = verification.salePrice;
        const sqft = c.squareFootage ?? null;
        if (!price || !sqft) continue;
        built.push({
          address: addr,
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
        });
      }

      const isLastAttempt = attempt === attempts[attempts.length - 1];
      if (built.length >= limit || isLastAttempt) {
        verifiedComps = built;
        rawEligibleCount = eligible.length;
        usedAttempt = attempt;
        break;
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (!verifiedComps) {
    return NextResponse.json(
      { error: lastError?.message || "No comparable sales found for this address." },
      { status: 404 }
    );
  }

  const medianPricePerSqft = median(verifiedComps.map((c) => c.pricePerSqft).filter(Boolean));

  // Final similarity rank with renovated-resale tiebreak.
  const scored = verifiedComps.map((c) => {
    const sqftDiffPct = subjSqft && c.sqft ? Math.abs(c.sqft - subjSqft) / subjSqft : 0;
    const bedsDiff = subjBeds != null && c.beds != null ? Math.abs(c.beds - subjBeds) : 0;
    const bathsDiff = subjBaths != null && c.baths != null ? Math.abs(c.baths - subjBaths) : 0;
    const likelyRenovated = medianPricePerSqft ? c.pricePerSqft >= medianPricePerSqft : null;
    const similarityScore =
      sqftDiffPct * 100 +
      bedsDiff * 15 +
      bathsDiff * 12 +
      (c.distance || 0) * 1.5 -
      (likelyRenovated ? 4 : 0);
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
    apiCallsUsed: verificationCount + (usedAttempt ? attempts.indexOf(usedAttempt) + 1 : 0),
  });
}
