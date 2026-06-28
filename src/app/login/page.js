"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(searchParams.get("redirectTo") || "/app");
    router.refresh();
  }

  return (
    <main className="container">
      <form className="card auth-form" onSubmit={handleSubmit}>
        <h2 style={{ color: "var(--navy)", marginTop: 0 }}>Log in</h2>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="field-error">{error}</p>}
        <button type="submit" className="btn primary" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Signing in…" : "Log in"}
        </button>
        <p className="muted" style={{ marginTop: 14 }}>
          No account? <Link href="/signup">Start a free trial</Link>
        </p>
      </form>
    </main>
  );
}
