import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const RENTCAST_AVM_BASE = "https://api.rentcast.io/v1/avm/value";
// Pulls included per plan per calendar month; beyond this the UI warns of overage.
const FREE_COMP_PULLS = 5;
// Always request max from RentCast — filter and rank in-app, never at the API level.
const COMP_COUNT = 25;
// Number of comps to surface to the user.
const TARGET_COMPS = 3;

// CORS headers — allow the standalone HTML and any custom domain.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  return (Date.now() - new Date(dateStr).getTime()) / 86400000;
}

async function fetchAVMComps({ address, propertyType, bedrooms, bathrooms, squareFootage, maxRadius, daysOld }) {
  const params = new URLSearchParams({ address, compCount: String(COMP_COUNT) });
  if (propertyType)   params.set("propertyType",   propertyType);
  if (bedrooms)       params.set("bedrooms",        String(bedrooms));
  if (bathrooms)      params.set("bathrooms",       String(bathrooms));
  if (squareFootage)  params.set("squareFootage",   String(squareFootage));
  if (maxRadius)      params.set("maxRadius",       String(maxRadius));
  if (daysOld)        params.set("daysOld",         String(daysOld));

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

// Score a comp — lower score = better match.
// Priority: correlation → recency → GLA delta → yearBuilt delta
function scoreComp(comp, subjSqft, subjYearBuilt) {
  let score = 0;

  // 1. Correlation (RentCast's own similarity ranking) — baseline
  score += (1 - (comp.correlation ?? 0)) * 100;

  // 2. Recency — prefer comps sold within 90 days
  const ageDays = daysSince(comp.lastSaleDate);
  if (ageDays === null)       score += 30;
  else if (ageDays <= 90)     score += 0;
  else if (ageDays <= 365)    score += 10;
  else                         score += 25;

  // 3. GLA delta — prefer within ±20% of subject squareFootage
  if (subjSqft && comp.squareFootage) {
    const delta = Math.abs(comp.squareFootage - subjSqft) / subjSqft;
    if (delta > 0.30)       score += 25;
    else if (delta > 0.20)  score += 10;
  }

  // 4. Year built delta — rough renovation-potential proxy
  if (subjYearBuilt && comp.yearBuilt) {
    const delta = Math.abs(comp.yearBuilt - subjYearBuilt);
    if (delta > 20)       score += 10;
    else if (delta > 10)  score += 5;
  }

  return score;
}

// Derive plain-text exclusion reasons for comps that didn't make the top-3.
// Only hard-exclude on missing price or very old/low-correlation data.
// Missing sqft is a data gap we note but do NOT exclude on — RentCast often
// omits squareFootage in the AVM comparables array even for valid sales.
function exclusionReasons(comp, subjSqft) {
  const reasons = [];
  if (!comp.price)                                      reasons.push("no sale price available");
  const ageDays = daysSince(comp.lastSaleDate);
  if (ageDays !== null && ageDays > 545)                reasons.push("sold >18 months ago");
  if ((comp.correlation ?? 0) < 0.05)                   reasons.push("correlation too low");
  return reasons;
}

// Separate data notes (informational) from hard exclusions.
function dataNotes(comp, subjSqft) {
  const notes = [];
  if (!comp.squareFootage)  notes.push("sqft not available");
  if (!comp.lastSaleDate)   notes.push("sale date not available");
  if (subjSqft && comp.squareFootage) {
    const delta = Math.abs(comp.squareFootage - subjSqft) / subjSqft;
    if (delta > 0.30) notes.push(`sqft ${comp.squareFootage > subjSqft ? "+" : "-"}${Math.round(delta * 100)}% from subject`);
  }
  return notes;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // ── Auth: Supabase session OR standalone API key ───────────────────────────
  const standaloneKey = searchParams.get("key");
  const isStandalone  = standaloneKey &&
    process.env.COMPS_STANDALONE_KEY &&
    standaloneKey === process.env.COMPS_STANDALONE_KEY;

  let user = null;
  const supabase = await createClient();
  if (!isStandalone) {
    const { data: { user: u } } = await supabase.auth.getUser();
    user = u;
    if (!user) {
      return NextResponse.json(
        { error: "Not signed in. Use the GoingFlip app or provide a standalone API key." },
        { status: 401, headers: CORS_HEADERS }
      );
    }
  }

  if (!process.env.RENTCAST_API_KEY) {
    return NextResponse.json(
      { error: "Comps lookup isn't configured yet — missing RENTCAST_API_KEY." },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  // ── Usage tracking ─────────────────────────────────────────────────────────
  const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  let pullsBefore = 0;
  if (user) {
    const { data: usageRow } = await supabase
      .from("comp_usage")
      .select("pull_count")
      .eq("user_id", user.id)
      .eq("month", currentMonth)
      .single();
    pullsBefore = usageRow?.pull_count ?? 0;
  }

  // ── Input parsing ──────────────────────────────────────────────────────────
  const address = searchParams.get("address")?.trim();
  if (!address) return NextResponse.json({ error: "Address is required." }, { status: 400, headers: CORS_HEADERS });

  const propertyType  = searchParams.get("propertyType") || "Single Family";
  const subjSqft      = searchParams.get("sqft")      ? Number(searchParams.get("sqft"))      : null;
  const subjBeds      = searchParams.get("beds")      ? Number(searchParams.get("beds"))      : null;
  const subjBaths     = searchParams.get("baths")     ? Number(searchParams.get("baths"))     : null;
  const subjYearBuilt = searchParams.get("yearBuilt") ? Number(searchParams.get("yearBuilt")) : null;

  // ── Progressive loosening (Attempt 1 → 2 → 3 fallback) ───────────────────
  // Stop as soon as we have ≥ TARGET_COMPS so we use the tightest possible search.
  const attempts = [
    { maxRadius: 0.5, daysOld: 180, label: "0.5 mi / 6 mo"  },
    { maxRadius: 1.0, daysOld: 365, label: "1.0 mi / 12 mo" },
    { maxRadius: 2.0, daysOld: 545, label: "2.0 mi / 18 mo" }, // fallback — flag to user
  ];

  let allComps      = [];
  let usedAttempt   = null;
  let fallbackWarning = false;
  let lastError     = null;

  for (const attempt of attempts) {
    try {
      const data  = await fetchAVMComps({
        address,
        propertyType,
        bedrooms:      subjBeds,
        bathrooms:     subjBaths,
        squareFootage: subjSqft,
        maxRadius:     attempt.maxRadius,
        daysOld:       attempt.daysOld,
      });
      const comps = data?.comparables || [];

      if (comps.length > allComps.length) {
        allComps    = comps;
        usedAttempt = attempt;
        if (attempt.maxRadius >= 2.0) fallbackWarning = true;
      }

      // Break only when we have enough comps that have a sale price.
      // Raw count alone can mislead — RentCast sometimes returns comps without
      // price or key fields, so we check usable count to decide if loosening is needed.
      const usableCount = comps.filter(c => c.price).length;
      if (usableCount >= TARGET_COMPS) break;
    } catch (err) {
      lastError = err;
    }
  }

  // Hard failure: all attempts threw errors AND we have nothing to show
  if (!allComps.length && lastError) {
    return NextResponse.json(
      { error: lastError.message },
      { status: 502, headers: CORS_HEADERS }
    );
  }

  // ── Re-rank the returned comp pool ────────────────────────────────────────
  // Compute median $/sqft over the whole pool to detect outliers.
  const ppsqfts = allComps
    .filter(c => c.price && c.squareFootage)
    .map(c => c.price / c.squareFootage);
  const medianPpsqft = median(ppsqfts);

  const scored = allComps.map(c => {
    const ppsqft        = c.price && c.squareFootage ? c.price / c.squareFootage : null;
    // Flag comps whose $/sqft deviates >25% from the pool median — likely
    // renovated or distressed outliers; included but annotated for manual review.
    const ppsqftOutlier = medianPpsqft && ppsqft
      ? Math.abs(ppsqft - medianPpsqft) / medianPpsqft > 0.25
      : false;

    return {
      ...c,
      ppsqft,
      ppsqftOutlier,
      score:    scoreComp(c, subjSqft, subjYearBuilt),
      excluded: exclusionReasons(c, subjSqft),
      notes:    dataNotes(c, subjSqft),
    };
  });

  // Sort best-first (lowest score = best match)
  scored.sort((a, b) => a.score - b.score);

  // Eligible = no hard exclusion reasons; take top TARGET_COMPS
  const eligible    = scored.filter(c => c.excluded.length === 0);
  const ineligible  = scored.filter(c => c.excluded.length > 0);

  // If eligible < TARGET_COMPS, pad from ineligible (better to show something
  // with a warning than to block the user entirely — they can manually confirm)
  const topPool = eligible.length >= TARGET_COMPS
    ? eligible
    : [...eligible, ...ineligible];

  const topComps = topPool.slice(0, TARGET_COMPS).map(c => ({
    address:        c.formattedAddress || [c.addressLine1, c.city, c.state].filter(Boolean).join(", "),
    distance:       c.distance != null ? Number(Number(c.distance).toFixed(2)) : null,
    beds:           c.bedrooms        ?? null,
    baths:          c.bathrooms       ?? null,
    sqft:           c.squareFootage   ?? null,
    price:          c.price           ?? null,
    pricePerSqft:   c.ppsqft          ? Math.round(c.ppsqft) : null,
    ppsqftOutlier:  c.ppsqftOutlier,
    lotSize:        c.lotSize         ?? null,
    yearBuilt:      c.yearBuilt       ?? null,
    soldDate:       c.lastSaleDate    ?? null,
    verified:       c.excluded.length === 0, // true = passed all quality checks
    correlation:    c.correlation     ?? null,
    flagNote:       [...c.excluded, ...c.notes].length > 0 ? [...c.excluded, ...c.notes].join("; ") : null,
  }));

  // Surface exclusion reasons for comps NOT selected (up to 10, for transparency)
  const excludedSummary = ineligible.slice(0, 10).map(c => ({
    address: c.formattedAddress || [c.addressLine1, c.city, c.state].filter(Boolean).join(", "),
    reasons: c.excluded,
  }));

  const medianPricePerSqft = median(topComps.map(c => c.pricePerSqft).filter(Boolean));

  // ── Increment usage counter (authenticated calls only) ─────────────────────
  let newPullCount = pullsBefore + 1;
  let isPaidPull   = false;
  if (user) {
    await supabase.from("comp_usage").upsert(
      { user_id: user.id, month: currentMonth, pull_count: newPullCount },
      { onConflict: "user_id,month" }
    );
    isPaidPull = newPullCount > FREE_COMP_PULLS;
  } else {
    newPullCount = 0; // standalone key — no per-user quota
  }

  return NextResponse.json({
    comps:              topComps,
    suggestedArv:
      topComps.length && topComps.every(c => c.pricePerSqft) && subjSqft
        ? Math.round(
            (topComps.reduce((sum, c) => sum + c.pricePerSqft, 0) / topComps.length) * subjSqft
          )
        : null,
    radiusUsed:         usedAttempt?.maxRadius   ?? null,
    daysOldUsed:        usedAttempt?.daysOld     ?? null,
    searchLabel:        usedAttempt?.label        ?? null,
    medianPricePerSqft,
    compsConsidered:    allComps.length,
    verifiedCount:      topComps.filter(c => c.verified).length,
    requestedLimit:     TARGET_COMPS,
    fallbackWarning,    // true when 2.0mi/18mo search was needed — flag in UI
    excluded:           excludedSummary,
    usage: user ? {
      pullsThisMonth: newPullCount,
      freeLimit:      FREE_COMP_PULLS,
      isPaidPull,
      remaining:      Math.max(0, FREE_COMP_PULLS - newPullCount),
    } : null,
  }, { headers: CORS_HEADERS });
}
