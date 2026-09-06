export const metadata = { title: "Privacy Policy — GoingFlip" };

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 740, margin: "0 auto", padding: "56px 24px 80px", fontFamily: "'Helvetica Neue', Arial, sans-serif", color: "#1f3147", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 6 }}>Privacy Policy</h1>
      <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 40 }}>Last updated: September 6, 2026</p>

      <p>GoingFlip ("we", "us") takes your privacy seriously. This policy explains what information we collect, how we use it, and your rights regarding that information.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>1. Information We Collect</h2>
      <p><strong>Account information:</strong> When you sign up, we collect your email address and a hashed password. We do not store your password in plain text.</p>
      <p><strong>Billing information:</strong> Payment is processed by Stripe. We store only a Stripe customer ID and your subscription status — we never see or store your full card number, CVV, or bank details.</p>
      <p><strong>Property search data:</strong> When you pull comparable sales, we send the property address and basic parameters (beds, baths, square footage) to our data provider (RentCast) to retrieve results. We log the number of searches you perform for billing purposes.</p>
      <p><strong>Saved deals:</strong> Deal data you choose to save (address, purchase price, rehab budget, notes) is stored in our database associated with your account.</p>
      <p><strong>Usage data:</strong> We may collect standard server logs including IP address, browser type, and pages visited for security and diagnostic purposes.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>2. How We Use Your Information</h2>
      <p>We use your information to: operate and maintain your account; process payments and manage your subscription; deliver comparable sales search results; respond to support requests; send transactional emails (account confirmation, billing receipts, subscription changes); and improve the Service.</p>
      <p>We do not sell your personal information to third parties. We do not use your data for advertising.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>3. Third-Party Services</h2>
      <p>We work with the following third-party providers who may receive limited data as necessary to deliver the Service:</p>
      <ul style={{ paddingLeft: 24 }}>
        <li><strong>Supabase</strong> — authentication and database hosting (your account data and saved deals)</li>
        <li><strong>Stripe</strong> — payment processing and subscription management</li>
        <li><strong>RentCast</strong> — real estate data provider for comparable sales searches (receives property address and search parameters)</li>
        <li><strong>Vercel</strong> — application hosting and deployment</li>
      </ul>
      <p>Each provider operates under their own privacy policy and security standards.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>4. Data Retention</h2>
      <p>We retain your account data for as long as your account is active. If you delete your account, we will delete or anonymize your personal data within 30 days, except where retention is required by law or for legitimate business purposes (such as billing records).</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>5. Security</h2>
      <p>We use industry-standard security measures including encrypted connections (HTTPS), hashed passwords, and restricted database access. No method of transmission over the internet is 100% secure — while we work to protect your data, we cannot guarantee absolute security.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>6. Your Rights</h2>
      <p>Depending on where you live, you may have the right to access, correct, or delete the personal data we hold about you. California residents have additional rights under the CCPA. To exercise any of these rights, email <a href="mailto:support@goingflip.com" style={{ color: "#1f3147" }}>support@goingflip.com</a> and we will respond within 30 days.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>7. Cookies</h2>
      <p>We use session cookies required for authentication. We do not use advertising or tracking cookies. We do not use third-party analytics services that track you across other websites.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>8. Children</h2>
      <p>GoingFlip is not directed to children under 18. We do not knowingly collect personal information from anyone under 18.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>9. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. We will notify you of material changes by email or by posting a notice in the app. Continued use of the Service after changes take effect constitutes acceptance.</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 40, marginBottom: 10 }}>10. Contact</h2>
      <p>Privacy questions or requests: <a href="mailto:support@goingflip.com" style={{ color: "#1f3147" }}>support@goingflip.com</a></p>
    </main>
  );
}
