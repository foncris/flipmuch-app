import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container">
      <section style={{ textAlign: "center", padding: "40px 0 20px" }}>
        <h1 style={{ fontSize: 38, color: "var(--navy)", marginBottom: 10 }}>
          Know if the flip makes sense — before you make an offer.
        </h1>
        <p className="muted" style={{ fontSize: 17, maxWidth: 620, margin: "0 auto 28px" }}>
          Enter the address, purchase price, rehab budget, and ARV. GoingFlip runs the comps,
          fees, and the 70% rule, and tells you whether the deal works — with a financing
          breakdown if you're using a loan.
        </p>
        <Link href="/signup" className="btn primary" style={{ fontSize: 16, padding: "12px 22px" }}>
          Start free trial
        </Link>
      </section>

      <section className="card" style={{ marginTop: 40 }}>
        <h2 style={{ color: "var(--navy)" }}>What it does</h2>
        <p className="muted">
          Subject property details, sales comparables within 1.5 miles, realtor fees,
          inspection and appraisal fees, the 60/70 rule, a full deal breakdown, and an
          optional financing section modeled on real lender underwriting terms.
        </p>
      </section>
    </main>
  );
}
