import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  // If already logged in, go straight to the calculator
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/app");

  return (
    <main style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>

      {/* ── HERO ── */}
      <section style={{
        background: "var(--navy)",
        color: "#fff",
        padding: "72px 28px 80px",
        textAlign: "center",
      }}>
        <p style={{ color: "var(--gold, #a9824c)", fontWeight: 700, fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 18 }}>
          Fix &amp; Flip Deal Analyzer
        </p>
        <h1 style={{ fontSize: "clamp(28px, 5vw, 52px)", fontWeight: 800, lineHeight: 1.15, maxWidth: 740, margin: "0 auto 22px", letterSpacing: "-0.5px" }}>
          Know if the flip makes sense —<br />before you make an offer.
        </h1>
        <p style={{ fontSize: 18, color: "#b8c4cf", maxWidth: 580, margin: "0 auto 36px", lineHeight: 1.6 }}>
          Enter an address, purchase price, rehab budget, and ARV. GoingFlip pulls real comps, runs the 70% rule, and tells you whether the deal works — in seconds.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/signup" className="btn primary" style={{ fontSize: 15, padding: "13px 28px" }}>
            Start free trial
          </Link>
          <Link href="/login" className="btn" style={{ fontSize: 15, padding: "13px 28px", borderColor: "#4a6580", color: "#cfd6dd", background: "transparent" }}>
            Log in
          </Link>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ background: "var(--cream)", padding: "64px 28px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", color: "var(--navy)", fontSize: 28, marginBottom: 48, fontWeight: 700 }}>
            How it works
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 32 }}>
            {[
              { n: "1", title: "Enter the property", body: "Address, purchase price, rehab budget, square footage, and ARV — takes under 2 minutes." },
              { n: "2", title: "Pull sold comps", body: "One click fetches up to 8 comparable sales within 1.5 miles, filtered by beds, baths, and size." },
              { n: "3", title: "Get the full breakdown", body: "All-in costs, net profit, cash-on-cash ROI, the 60/70 rule, and a pass/caution/fail verdict." },
              { n: "4", title: "Model the financing", body: "Add a hard-money or private loan — see monthly interest, points, total cost, and your real cash invested." },
            ].map(({ n, title, body }) => (
              <div key={n} style={{ textAlign: "center" }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--gold, #a9824c)", color: "#fff", fontWeight: 800, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>{n}</div>
                <h3 style={{ color: "var(--navy)", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
                <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{ background: "#fff", padding: "64px 28px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", color: "var(--navy)", fontSize: 28, marginBottom: 12, fontWeight: 700 }}>
            Everything in one place
          </h2>
          <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 15, marginBottom: 48 }}>
            No spreadsheets. No guessing. Just clear numbers.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
            {[
              { icon: "📍", title: "Real sales comparables", body: "Pulls actual sold properties within 1.5 miles, matched by beds, baths, and square footage." },
              { icon: "📊", title: "70% rule & deal verdict", body: "Instant pass, caution, or fail — with the exact numbers behind the decision." },
              { icon: "💰", title: "All closing costs included", body: "Realtor commission, buyer closing costs, inspection, and appraisal fees — all pre-calculated." },
              { icon: "🏦", title: "Financing breakdown", body: "Model hard-money or private loans: origination fee, interest rate, hold period, and total cost." },
              { icon: "💾", title: "Save your deals", body: "Save unlimited deals and come back to them anytime. Compare properties side by side." },
              { icon: "📱", title: "Works on any device", body: "Desktop, tablet, or phone — analyze a deal from anywhere, including at the property." },
            ].map(({ icon, title, body }) => (
              <div key={title} style={{ background: "var(--cream)", borderRadius: 8, padding: "22px 20px" }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
                <h3 style={{ color: "var(--navy)", fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{title}</h3>
                <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section style={{ background: "var(--cream)", padding: "64px 28px" }}>
        <div style={{ maxWidth: 460, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ color: "var(--navy)", fontSize: 28, marginBottom: 12, fontWeight: 700 }}>Simple pricing</h2>
          <p style={{ color: "var(--muted)", fontSize: 15, marginBottom: 40 }}>
            One plan. Everything included. Cancel anytime.
          </p>

          <div style={{
            background: "#fff",
            border: "2px solid var(--gold, #a9824c)",
            borderRadius: 12,
            padding: "36px 32px",
            boxShadow: "0 4px 24px rgba(31,49,71,0.08)",
          }}>
            <div style={{ display: "inline-block", background: "var(--gold, #a9824c)", color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", borderRadius: 4, padding: "4px 10px", marginBottom: 20 }}>
              Most Popular
            </div>
            <div style={{ fontSize: 48, fontWeight: 800, color: "var(--navy)", lineHeight: 1 }}>
              $19
              <span style={{ fontSize: 16, fontWeight: 400, color: "var(--muted)" }}> / month</span>
            </div>
            <p style={{ color: "var(--muted)", fontSize: 14, margin: "10px 0 28px" }}>
              Includes 5 comp pulls/month · $3.00 per extra pull
            </p>

            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", textAlign: "left" }}>
              {[
                "Full fix & flip deal analyzer",
                "5 comparable sales searches / month",
                "Up to 8 comps per search (1.5 mi radius)",
                "Realtor, inspection & appraisal fees",
                "60/70 rule with pass/caution/fail verdict",
                "Financing model (hard money & private loans)",
                "Unlimited saved deals",
                "Works on desktop & mobile",
              ].map((item) => (
                <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: "var(--ink)", marginBottom: 12 }}>
                  <span style={{ color: "var(--gold, #a9824c)", fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                  {item}
                </li>
              ))}
            </ul>

            <Link href="/signup" className="btn primary" style={{ display: "block", textAlign: "center", fontSize: 15, padding: "13px 0", borderRadius: 7 }}>
              Start free trial
            </Link>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
              No credit card required to get started.
            </p>
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section style={{ background: "var(--navy)", color: "#fff", textAlign: "center", padding: "56px 28px" }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 14 }}>Ready to analyze your first deal?</h2>
        <p style={{ color: "#b8c4cf", fontSize: 16, marginBottom: 32, maxWidth: 480, margin: "0 auto 32px" }}>
          Stop guessing. Know the numbers before you write the offer.
        </p>
        <Link href="/signup" className="btn primary" style={{ fontSize: 15, padding: "13px 28px" }}>
          Get started free
        </Link>
      </section>

    </main>
  );
}
