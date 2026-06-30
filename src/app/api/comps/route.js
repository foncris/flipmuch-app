import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const RENTCAST_BASE = "https://api.rentcast.io/v1/avm/value";
const DEFAULT_COMP_LIMIT = 3;
const MAX_COMP_LIMIT = 10;
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

// Pulls recently SOLD comparable properties for a subject address from
// RentCast's AVM endpoint. RentCast's comp engine already ranks results by
// similarity (the "correlation" field) using beds/baths/sqft/condition-type
// signals it has on file for each property, which is the closest we can get
// to a manual "similar condition" filter via API (it doesn't expose a raw
// condition/lot-size query param) — but it doesn't strictly enforce property
// type or size/bed/bath closeness, so we filter and re-rank below.
//
// Search policy (per flipmuch underwriting preference):
//   - Prefer tight radius (1.5 mi) and recent sales (last 90 days) first.
//   - If fewer than the requested number of SAME-TYPE comps come back,
//     widen radius up to 2 mi and/or recency up to 365 days (12 months) —
//     in that order — until we have enough comps or run out of room to widen.
async function fetchRentCastComps({ address, bedrooms, bathrooms, squareFootage, propertyType, maxRadius, daysOld }) {
  const params = new URLSearchParams({ address, compCount: "25" });
  if (propertyType) params.set("propertyType", propertyType);
  if (bedrooms) params.set("bedrooms", String(bedrooms));
  if (bathrooms) params.set("bathrooms", String(bathrooms));
  if (squareFootage) params.set("squareFootage", String(squareFootage));
  if (maxRadius) params.set("maxRadius", String(maxRadius));
  if (daysOld) params.set("daysOld", String(daysOld));

  const res = await fetch(`${RENTCAST_BASE}?${params.toString()}`, {
    headers: { "X-Api-Key": process.env.RENTCAST_API_KEY },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RentCast ${res.status}: ${text.slice(0, 300) || res.statusText}`);
  }
  return res.json();
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

  // Widen the net in stages: tight + recent first, then relax distance,
  // then relax recency, up to the 1.5–2 mi / 3–12 month bounds. "Enough"
  // means enough comps that ALSO match the subject's housing type — a
  // bigger pool of the wrong type (e.g. condo towers) doesn't help.
  const attempts = [
    { maxRadius: 1.5, daysOld: 90 },
    { maxRadius: 1.5, daysOld: 180 },
    { maxRadius: 2, daysOld: 180 },
    { maxRadius: 2, daysOld: 365 },
  ];

  let result = null;
  let usedAttempt = null;
  let lastError = null;

  for (const attempt of attempts) {
    try {
      const data = await fetchRentCastComps({ address, bedrooms, bathrooms, squareFootage, propertyType, ...attempt });
      const comps = data?.comparables || [];
      const sameTypeCount = comps.filter(isSameType).length;
      const isLastAttempt = attempt === attempts[attempts.length - 1];
      if (sameTypeCount >= limit || isLastAttempt) {
        result = data;
        usedAttempt = attempt;
        break;
      }
    } catch (err) {
      lastError = err;
      // Keep trying wider searches — a bad geocode at a tight radius can
      // still succeed once the query relaxes.
    }
  }

  if (!result) {
    return NextResponse.json(
      { error: lastError?.message || "No comparable sales found for this address." },
      { status: 404 }
    );
  }

  const candidates = (result.comparables || [])
    .filter(isSameType)
    .map((c) => {
      const price = c.price ?? null;
      const sqft = c.squareFootage ?? null;
      return {
        address: c.formattedAddress || [c.addressLine1, c.city, c.state].filter(Boolean).join(", "),
        distance: c.distance != null ? Number(Number(c.distance).toFixed(2)) : null,
        beds: c.bedrooms ?? null,
        baths: c.bathrooms ?? null,
        sqft,
        price,
        pricePerSqft: price && sqft ? price / sqft : null,
        lotSize: c.lotSize ?? null,
        yearBuilt: c.yearBuilt ?? null,
        soldDate: c.removedDate || c.listedDate || null,
        correlation: c.correlation ?? null,
      };
    })
    .filter((c) => c.price && c.sqft);

  // Fix-and-flip ARV comps need to reflect POST-renovation value, not just
  // any nearby sale. RentCast's AVM doesn't expose a literal "renovated"
  // flag, so we use price/sqft relative to the (now type-matched) comp pool
  // as the proxy: properties that sold well above the pool's median $/sqft
  // are almost always the updated/flipped resales.
  const medianPricePerSqft = median(candidates.map((c) => c.pricePerSqft).filter(Boolean));

  // Rank by how closely each comp matches the SUBJECT's own sqft/beds/full
  // baths — this is what keeps a 3,500 sf / 5-bed / 5-bath house from being
  // "matched" against smaller or differently-configured homes just because
  // they're nearby. Likely-renovated comps get a small tiebreak bonus since
  // they better represent the subject's post-rehab condition, but actual
  // similarity to the subject's size/layout drives the ranking.
  const scored = candidates.map((c) => {
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

  scored.sort((a, b) => a.similarityScore - b.similarityScore);

  const comps = scored.slice(0, limit).map(({ similarityScore, ...c }) => c);

  return NextResponse.json({
    comps,
    suggestedArv: result.price ?? null,
    radiusUsed: usedAttempt?.maxRadius ?? null,
    daysOldUsed: usedAttempt?.daysOld ?? null,
    medianPricePerSqft,
    compsConsidered: candidates.length,
  });
}
