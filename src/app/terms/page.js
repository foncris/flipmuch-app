export const metadata = { title: "Terms of Service — GoingFlip" };

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 740, margin: "0 auto", padding: "56px 24px 80px", fontFamily: "'Helvetica Neue', Arial, sans-serif", color: "#1f3147", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 6 }}>Terms of Service</h1>
      <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 40 }}>Last updated: September 6, 2026</p>

      <p>By creating an account or using GoingFlip ("Service", "we", "us"), you agree to these Terms of Service. Please read them carefully before signing up.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>1. Description of Service</h2>
      <p>GoingFlip is a fix-and-flip deal analysis tool that calculates estimated costs, returns, and sourced sales comparables for residential real estate properties. All outputs are for informational and educational purposes only and do not constitute professional financial, investment, legal, or real estate advice. You should consult qualified professionals before making any investment decision.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>2. Disclaimer — No Professional Advice</h2>
      <p>The analyses, comparable sales data, ARV estimates, ROI figures, and deal verdicts produced by GoingFlip are generated algorithmically and may be inaccurate, incomplete, or out of date. GoingFlip does not verify property condition, title, zoning, or any other factor material to a real estate transaction. <strong>Nothing on this platform should be relied upon as a substitute for a licensed appraiser, real estate agent, attorney, or financial advisor.</strong> You assume full responsibility for any investment decision you make.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>3. Eligibility</h2>
      <p>You must be at least 18 years old and capable of forming a binding contract to use GoingFlip. By using the Service you represent that you meet these requirements.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>4. Subscription & Billing</h2>
      <p>GoingFlip offers a monthly subscription at $19.00/month, which includes 5 comparable sales searches per calendar month. Additional searches are available at $3.00 each. Prices are in USD and are subject to change with 30 days' notice.</p>
      <p>Billing is handled by Stripe. By subscribing you authorize us to charge your payment method on a recurring monthly basis. Your subscription renews automatically on the same day each month unless cancelled before the renewal date.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>5. Free Trial</h2>
      <p>New accounts may receive a free trial period as described at signup. No credit card is required to start a trial. At the end of the trial period your account will require an active paid subscription to continue accessing premium features.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>6. Cancellation</h2>
      <p>You may cancel your subscription at any time from the Billing page in your account. Cancellation takes effect at the end of your current paid billing period — you will retain full access until that date. We do not prorate unused time.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>7. Refund Policy</h2>
      <p>All subscription charges are non-refundable. If you cancel, your access continues through the end of the period you already paid for. Exceptions may be made at our sole discretion for documented billing errors — contact <a href="mailto:support@goingflip.com" style={{ color: "#1f3147" }}>support@goingflip.com</a> within 7 days of the charge.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>8. Comparable Sales Data</h2>
      <p>Sales comparable data is sourced from third-party providers and is provided "as is." We make no warranties about accuracy, completeness, or fitness for any particular purpose. Comp pull credits are consumed upon each successful search and are non-refundable regardless of whether the results meet your expectations.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>9. Acceptable Use</h2>
      <p>You agree not to: (a) resell or redistribute data obtained from GoingFlip; (b) use automated scripts to query the Service; (c) attempt to circumvent usage limits; or (d) use the Service for any unlawful purpose.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>10. Intellectual Property</h2>
      <p>GoingFlip and its content, features, and functionality are owned by us and are protected by copyright and other intellectual property laws. You may not copy, modify, or distribute any part of the Service without our written permission.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>11. Limitation of Liability</h2>
      <p>To the maximum extent permitted by law, GoingFlip and its owners, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including lost profits or investment losses, arising from your use of the Service. Our total liability to you for any claim shall not exceed the amount you paid us in the 3 months preceding the claim.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>12. Changes to Terms</h2>
      <p>We may update these Terms at any time. We will notify you by email or by posting a notice in the app at least 14 days before material changes take effect. Continued use after that date constitutes acceptance.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>13. Governing Law</h2>
      <p>These Terms are governed by the laws of the State of Florida, United States, without regard to its conflict-of-law provisions.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>14. Contact</h2>
      <p>Questions about these Terms? Email us at <a href="mailto:support@goingflip.com" style={{ color: "#1f3147" }}>support@goingflip.com</a>.</p>
    </main>
  );
}
