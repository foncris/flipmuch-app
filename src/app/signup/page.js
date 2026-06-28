"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
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
        <label htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="field-error">{error}</p>}
        <button type="submit" className="btn primary" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Creating account…" : "Create account"}
        </button>
        <p className="muted" style={{ marginTop: 14 }}>
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </form>
    </main>
  );
}
