import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const RENTCAST_AVM_BASE     = "https://api.rentcast.io/v1/avm/value";
const RENTCAST_RECORDS_BASE = "https://api.rentcast.io/v1/properties";

// Pulls included per plan per calendar month.
const FREE_COMP_PULLS = 5;
// Always pull the maximum from RentCast; filter and rank in-app.
const COMP_COUNT = 25;
// Final comps to surface to the user.
const TARGET_COMPS = 3;
// How many top candidates we enrich via Property Records when sqft is missing.
// Keeps extra API calls bounded — we only look up the best candidates, not all 25.
const MAX_ENRICH_CALLS = 6;

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

function addressOf(c) {
  return c.formattedAddress || [c.addressLine1, c.city, c.state].filter(Boolean).join(", ");
}

async function fetchAVMComps({ address, propertyType, bedrooms, bathrooms, squareFootage, maxRadius, daysOld }) {
  const params = new URLSearchParams({ address, compCount: String(COMP_COUNT) });
  if (propertyType)  params.set("propertyType",  propertyType);
  if (bedrooms)      params.set("bedrooms",       String(bedrooms));
  if (bathrooms)     params.set("bathrooms",      String(bathrooms));
  if (squareFootage) params.set("squareFootage",  String(squareFootage));
  if (maxRadius)     params.set("maxRadius",      String(maxRadius));
  if (daysOld)       params.set("daysOld",        String(daysOld));

  const res = await fetch(`${RENTCAST_AVM_BASE}?${params.toString()}`, {
    headers: { "X-Api-Key": process.env.RENTCAST_API_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RentCast AVM ${res.status}: ${text.slice(0, 300) || res.statusText}`);
  }
  return res.json();
}

// Fetch property record for a single address to fill in missing fields (sqft,
// yearBuilt, lastSaleDate, lastSalePrice). Returns null on any failure so we
// degrade gracefully without breaking the whole request.
async function fetchPropertyRecord(address) {
  try {
    const params = new URLSearchParams({ address });
    const res = await fetch(`${RENTCAST_RECORDS_BASE}?${params.toString()}`, {
      headers: { "X-Api-Key": process.env.RENTCAST_API_KEY },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
  } catch {
    return null;
  }
}

// ── Scoring ────────────────────────────────────────────────────────────────
// Lower score = better comp. Priority order mirrors residential appraisal
// practice: similarity (correlation) → recency → GLA delta → age delta.
// sqft MUST be known before we can finalize a comp; this function is used
// both for a cheap pre-rank (sqft may be null) and for the final rank after
// enrichment (sqft should be populated).
function scoreComp(comp, subjSqft, subjYearBuilt) {
  let score = 0;

  // 1. Correlation — RentCast's own similarity signal, highest weight
  score += (1 - (comp.squareFootage_enriched_correlation ?? comp.correlation ?? 0)) * 100;

  // 2. Recency — comps >12 months require time adjustments; >18 months are stale
  const ageDays = daysSince(comp.lastSaleDate);
  if (ageDays === null)    score += 30;  // unknown recency is risky
  else if (ageDays <= 90)  score += 0;
  else if (ageDays <= 180) score += 5;
  else if (ageDays <= 365) score += 12;
  else                      score += 28; // >12 months needs time adjustment flag

  // 3. GLA (Gross Living Area) delta — core appraisal adjustment driver
  if (subjSqft && comp.squareFootage) {
    const pct = Math.abs(comp.squareFootage - subjSqft) / subjSqft;
    if (pct > 0.40)      score += 40; // >40% GLA diff: comp is borderline
    else if (pct > 0.25) score += 20;
    else if (pct > 0.15) score += 8;
    // ±15% or less: no penalty (within normal appraisal tolerance)
  } else if (!comp.squareFootage) {
    // sqft unknown pre-enrichment: apply a moderate penalty so we prioritise
    // comps that already have sqft, but don't eliminate these candidates yet
    score += 15;
  }

  // 4. Year built delta — rough condition/renovation-potential proxy
  if (subjYearBuilt && comp.yearBuilt) {
    const delta = Math.abs(comp.yearBuilt - subjYearBuilt);
    if (delta > 30)      score += 12;
    else if (delta > 15) score += 6;
    else if (delta > 5)  score += 2;
  }

  return score;
}

// Hard exclusion reasons — these are dealbreakers for a valid comp.
// Missing sqft is NOT a hard exclusion here; we try to enrich it first.
function hardExclusions(comp) {
  const reasons = [];
  if (!comp.price)                                   reasons.push("no sale price available");
  const ageDays = daysSince(comp.lastSaleDate);
  if (ageDays !== null && ageDays > 545)             reasons.push("sold >18 months ago");
  if ((comp.correlation ?? 0) < 0.05)               reasons.push("correlation too low");
  return reasons;
}

// Informational quality flags — shown to user but do NOT disqualify the comp.
function qualityFlags(comp, subjSqft) {
  const flags = [];
  if (!comp.squareFootage)                          flags.push("sqft missing — could not enrich");
  if (!comp.lastSaleDate)                           flags.push("sale date unknown");
  if (subjSqft && comp.squareFootage) {
    const pct = Math.abs(comp.squareFootage - subjSqft) / subjSqft;
    if (pct > 0.25) flags.push(`GLA ${comp.squareFootage > subjSqft ? "+" : "-"}${Math.round(pct * 100)}% vs subject — size adjustment required`);
  }
  const ageDays = daysSince(comp.lastSaleDate);
  if (ageDays !== null && ageDays > 365)            flags.push("sold >12 months ago — time adjustment recommended");
  return flags;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // ── Auth ──────────────────────────────────────────────────────────────────
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

  // ── Usage tracking ────────────────────────────────────────────────────────
  const currentMonth = new Date().toISOString().slice(0, 7);
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

  // ── Input parsing ─────────────────────────────────────────────────────────
  const address = searchParams.get("address")?.trim();
  if (!address) return NextResponse.json({ error: "Address is required." }, { status: 400, headers: CORS_HEADERS });

  const propertyType  = searchParams.get("propertyType") || "Single Family";
  const subjSqft      = searchParams.get("sqft")      ? Number(searchParams.get("sqft"))      : null;
  const subjBeds      = searchParams.get("beds")      ? Number(searchParams.get("beds"))      : null;
  const subjBaths     = searchParams.get("baths")     ? Number(searchParams.get("baths"))     : null;
  const subjYearBuilt = searchParams.get("yearBuilt") ? Number(searchParams.get("yearBuilt")) : null;

  // ── STEP 1: Progressive loosening ────────────────────────────────────────
  // When the user overrides radius/days via the Search Options panel in the UI,
  // collapse to a single locked attempt using those values.
  // Otherwise use the progressive ladder: tightest first, widen until we have
  // enough priced comps (price is the only field we can't recover from Property Records).
  const overrideRadius = searchParams.get("maxRadius")  ? Number(searchParams.get("maxRadius"))  : null;
  const overrideDays   = searchParams.get("maxDaysOld") ? Number(searchParams.get("maxDaysOld")) : null;

  const attempts = (overrideRadius || overrideDays)
    ? [{ maxRadius: overrideRadius ?? 2.0, daysOld: overrideDays ?? 365, label: "custom" }]
    : [
        { maxRadius: 0.5, daysOld: 180, label: "0.5 mi / 6 mo"  },
        { maxRadius: 1.0, daysOld: 365, label: "1.0 mi / 12 mo" },
        { maxRadius: 2.0, daysOld: 545, label: "2.0 mi / 18 mo" },
      ];

  let allComps      = [];
  let usedAttempt   = null;
  let fallbackWarning = false;
  let lastError     = null;

  for (const attempt of attempts) {
    try {
      const data  = await fetchAVMComps({
        address, propertyType,
        bedrooms: subjBeds, bathrooms: subjBaths, squareFootage: subjSqft,
        maxRadius: attempt.maxRadius, daysOld: attempt.daysOld,
      });
      const comps = data?.comparables || [];

      if (comps.length > allComps.length) {
        allComps    = comps;
        usedAttempt = attempt;
        if (attempt.maxRadius >= 2.0) fallbackWarning = true;
      }

      // Only stop early when we have enough comps with a sale price AND sqft —
      // those are the two fields we cannot synthesize without extra API calls.
      // If sqft is missing, we continue loosening OR will enrich below.
      const fullyUsable = comps.filter(c => c.price && c.squareFootage).length;
      if (fullyUsable >= TARGET_COMPS) break;

      // Alternatively, stop if we have plenty of priced comps to enrich (sqft
      // can be fetched from Property Records for up to MAX_ENRICH_CALLS of them)
      const pricedCount = comps.filter(c => c.price).length;
      if (pricedCount >= TARGET_COMPS + MAX_ENRICH_CALLS) break;

    } catch (err) {
      lastError = err;
    }
  }

  if (!allComps.length && lastError) {
    return NextResponse.json({ error: lastError.message }, { status: 502, headers: CORS_HEADERS });
  }

  // ── STEP 2: Pre-rank, then enrich missing sqft via Property Records ───────
  // Score all candidates using what we have. Comps already having sqft rank
  // better (lower penalty); those missing sqft get a moderate pre-penalty.
  // We then enrich the top MAX_ENRICH_CALLS candidates that lack sqft so the
  // final ranking is appraisal-correct (GLA is always known for the top 3).
  const preScored = allComps
    .filter(c => c.price) // must have price — cannot recover from any source
    .map(c => ({ ...c, _preScore: scoreComp(c, subjSqft, subjYearBuilt) }))
    .sort((a, b) => a._preScore - b._preScore);

  // Enrich the top candidates that are missing sqft
  let enrichCalls = 0;
  for (const c of preScored) {
    if (enrichCalls >= MAX_ENRICH_CALLS) break;
    if (c.squareFootage) continue; // already have it
    const rec = await fetchPropertyRecord(addressOf(c));
    if (rec?.squareFootage) {
      c.squareFootage = rec.squareFootage;
      c._enrichedSqft = true;
    }
    if (!c.yearBuilt && rec?.yearBuilt) c.yearBuilt = rec.yearBuilt;
    if (!c.lastSaleDate  && rec?.lastSaleDate)  c.lastSaleDate  = rec.lastSaleDate;
    enrichCalls++;
  }

  // ── STEP 3: Final ranking after enrichment ────────────────────────────────
  // Compute pool-level $/sqft median (for outlier detection) using only comps
  // where both price and sqft are now known.
  const ppsqfts = preScored
    .filter(c => c.price && c.squareFootage)
    .map(c => c.price / c.squareFootage);
  const medianPpsqft = median(ppsqfts);

  const finalScored = preScored.map(c => {
    const ppsqft        = c.price && c.squareFootage ? c.price / c.squareFootage : null;
    // $/sqft outlier: >25% from pool median flags likely renovated or distressed sale.
    // Included in output — appraiser must manually decide whether to adjust or reject.
    const ppsqftOutlier = medianPpsqft && ppsqft
      ? Math.abs(ppsqft - medianPpsqft) / medianPpsqft > 0.25
      : false;

    return {
      ...c,
      ppsqft,
      ppsqftOutlier,
      _finalScore: scoreComp(c, subjSqft, subjYearBuilt),
      _excluded:   hardExclusions(c),
      _flags:      qualityFlags(c, subjSqft),
    };
  }).sort((a, b) => a._finalScore - b._finalScore);

  // Eligible = passed hard exclusion checks; ineligible = something disqualifying.
  // If fewer than TARGET_COMPS eligible, pad from ineligible with a flag so the
  // user always sees something rather than a silent empty result.
  const eligible   = finalScored.filter(c => c._excluded.length === 0);
  const ineligible = finalScored.filter(c => c._excluded.length > 0);
  const topPool    = eligible.length >= TARGET_COMPS
    ? eligible
    : [...eligible, ...ineligible];

  const topComps = topPool.slice(0, TARGET_COMPS).map(c => ({
    address:       addressOf(c),
    distance:      c.distance != null ? Number(Number(c.distance).toFixed(2)) : null,
    beds:          c.bedrooms      ?? null,
    baths:         c.bathrooms     ?? null,
    sqft:          c.squareFootage ?? null,
    sqftEnriched:  c._enrichedSqft ?? false, // true = sqft came from Property Records, not AVM
    price:         c.price         ?? null,
    pricePerSqft:  c.ppsqft        ? Math.round(c.ppsqft) : null,
    ppsqftOutlier: c.ppsqftOutlier,
    lotSize:       c.lotSize       ?? null,
    yearBuilt:     c.yearBuilt     ?? null,
    soldDate:      c.lastSaleDate  ?? null,
    correlation:   c.correlation   ?? null,
    verified:      c._excluded.length === 0,
    flags:         c._flags,                  // quality notes for appraiser review
    excluded:      c._excluded.length > 0 ? c._excluded : undefined,
  }));

  // Surface excluded comps so the user sees WHY they weren't chosen
  const excludedSummary = ineligible.slice(0, 8).map(c => ({
    address: addressOf(c),
    reasons: c._excluded,
  }));

  const medianPricePerSqft = median(topComps.map(c => c.pricePerSqft).filter(Boolean));

  // ── STEP 4: Suggested ARV ─────────────────────────────────────────────────
  // Only compute when all top comps have $/sqft (GLA known). An ARV based on
  // partial data would give a false sense of precision — better to be explicit
  // about when we can and can't compute it.
  const compsWithPpsqft = topComps.filter(c => c.pricePerSqft);
  const suggestedArv = compsWithPpsqft.length > 0 && subjSqft
    ? Math.round(
        (compsWithPpsqft.reduce((sum, c) => sum + c.pricePerSqft, 0) / compsWithPpsqft.length) * subjSqft
      )
    : null;

  // ── Usage counter ─────────────────────────────────────────────────────────
  let newPullCount = pullsBefore + 1;
  let isPaidPull   = false;
  if (user) {
    await supabase.from("comp_usage").upsert(
      { user_id: user.id, month: currentMonth, pull_count: newPullCount },
      { onConflict: "user_id,month" }
    );
    isPaidPull = newPullCount > FREE_COMP_PULLS;
  } else {
    newPullCount = 0;
  }

  return NextResponse.json({
    comps:             topComps,
    suggestedArv,
    arvBasis:          compsWithPpsqft.length < TARGET_COMPS
      ? `Based on ${compsWithPpsqft.length} of ${TARGET_COMPS} comps (sqft unavailable for ${TARGET_COMPS - compsWithPpsqft.length})`
      : null,
    radiusUsed:        usedAttempt?.maxRadius   ?? null,
    daysOldUsed:       usedAttempt?.daysOld     ?? null,
    searchLabel:       usedAttempt?.label        ?? null,
    medianPricePerSqft,
    compsConsidered:   allComps.length,
    enrichCallsUsed:   enrichCalls,
    verifiedCount:     topComps.filter(c => c.verified).length,
    requestedLimit:    TARGET_COMPS,
    fallbackWarning,
    excluded:          excludedSummary,
    usage: user ? {
      pullsThisMonth: newPullCount,
      freeLimit:      FREE_COMP_PULLS,
      isPaidPull,
      remaining:      Math.max(0, FREE_COMP_PULLS - newPullCount),
    } : null,
  }, { headers: CORS_HEADERS });
}
