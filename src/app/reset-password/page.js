"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setDone(true);
    setTimeout(() => {
      router.push("/app");
      router.refresh();
    }, 1500);
  }

  if (done) {
    return (
      <main className="container">
        <div className="card auth-form">
          <h2 style={{ color: "var(--navy)", marginTop: 0 }}>Password updated</h2>
          <p className="muted">Taking you to the app…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <form className="card auth-form" onSubmit={handleSubmit}>
        <h2 style={{ color: "var(--navy)", marginTop: 0 }}>Choose a new password</h2>
        <label htmlFor="password">New password</label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label htmlFor="confirm">Confirm new password</label>
        <input
          id="confirm"
          type="password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && <p className="field-error">{error}</p>}
        <button type="submit" className="btn primary" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </main>
  );
}
