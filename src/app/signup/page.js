"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!agreed) {
      setError("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <main className="container">
        <div className="card auth-form">
          <h2 style={{ color: "var(--navy)", marginTop: 0 }}>Check your email</h2>
          <p className="muted">We sent a confirmation link to {email}. Click it to finish setting up your account.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <form className="card auth-form" onSubmit={handleSubmit}>
        <h2 style={{ color: "var(--navy)", marginTop: 0 }}>Start your free trial</h2>
        <p className="muted" style={{ marginTop: -8, marginBottom: 20, fontSize: 13 }}>
          No credit card required. Free trial included with every new account.
        </p>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />

        {/* Terms of Service agreement */}
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginTop: 8, marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{ marginTop: 3, flexShrink: 0, accentColor: "var(--navy)" }}
          />
          <span style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
            I agree to GoingFlip&apos;s{" "}
            <Link href="/terms" target="_blank" style={{ color: "var(--navy)" }}>Terms of Service</Link>
            {" "}and{" "}
            <Link href="/privacy" target="_blank" style={{ color: "var(--navy)" }}>Privacy Policy</Link>
          </span>
        </label>

        {error && <p className="field-error">{error}</p>}
        <button type="submit" className="btn primary" disabled={loading} style={{ width: "100%", marginTop: 12 }}>
          {loading ? "Creating account…" : "Create account"}
        </button>
        <p className="muted" style={{ marginTop: 14 }}>
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </form>
    </main>
  );
}
