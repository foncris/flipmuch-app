"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
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
          <p className="muted">
            If an account exists for {email}, we sent a password reset link. Click it to choose a new password.
          </p>
          <p className="muted" style={{ marginTop: 14 }}>
            <Link href="/login">Back to log in</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <form className="card auth-form" onSubmit={handleSubmit}>
        <h2 style={{ color: "var(--navy)", marginTop: 0 }}>Reset your password</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Enter the email on your account and we&apos;ll send you a link to reset your password.
        </p>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && <p className="field-error">{error}</p>}
        <button type="submit" className="btn primary" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
        <p className="muted" style={{ marginTop: 14 }}>
          <Link href="/login">Back to log in</Link>
        </p>
      </form>
    </main>
  );
}
