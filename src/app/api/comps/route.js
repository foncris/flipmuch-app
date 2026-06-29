import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const RENTCAST_BASE = "https://api.rentcast.io/v1/avm/value";

function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Pulls recently SOLD comparable properties for a subject address from
// RentCast's AVM endpoint. RentCast's comp engine already ranks results by
// similarity (the "correlation" field) using beds/baths/sqft/condition-type
// signals it has on file for each property, which is the closest we can get
// to a manual "similar condition" filter via API (it doesn't expose a raw
// condition/lot-size query param).
//
// Search policy (per flipmuch underwriting preference):
//   - Prefer tight radius (1.5 mi) and recent sales (last 90 days) first.
//   - If fewer than 3 comps come back, widen radius up to 2 mi and/or
//     recency up to 365 days (12 months) — in that order — until we have
//     enough comps or run out of room to widen.
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

  // Widen the net in stages: tight + recent first, then relax distance,
  // then relax recency, up to the 1.5–2 mi / 3–12 month bounds.
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
      const isLastAttempt = attempt === attempts[attempts.length - 1];
      if (comps.length >= 3 || isLastAttempt) {
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
  // flag, so we use price/sqft relative to the local comp pool as the proxy:
  // within the same radius/size/bed-bath bracket, properties that sold well
  // above the pool's median $/sqft are almost always the updated/flipped
  // resales, while below-median ones are typically dated "as-is" sales. We
  // bias the returned set toward that upper tier so the suggested ARV lines
  // up with the deal's "fully renovated" assumption, with a safety net so we
  // don't starve the table down to nothing if the pool is small/tight.
  const medianPricePerSqft = median(candidates.map((c) => c.pricePerSqft).filter(Boolean));
  const rankedBySqftPrice = [...candidates].sort((a, b) => (b.pricePerSqft ?? 0) - (a.pricePerSqft ?? 0));
  const renovatedTier = medianPricePerSqft
    ? rankedBySqftPrice.filter((c) => c.pricePerSqft >= medianPricePerSqft)
    : rankedBySqftPrice;
  const finalList = renovatedTier.length >= 3 ? renovatedTier : rankedBySqftPrice;

  const comps = finalList.slice(0, 8).map((c) => ({
    ...c,
    likelyRenovated: medianPricePerSqft ? c.pricePerSqft >= medianPricePerSqft : null,
  }));

  return NextResponse.json({
    comps,
    suggestedArv: result.price ?? null,
    radiusUsed: usedAttempt?.maxRadius ?? null,
    daysOldUsed: usedAttempt?.daysOld ?? null,
    medianPricePerSqft,
  });
}
