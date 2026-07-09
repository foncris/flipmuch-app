"use client";
import { useState } from "react";

export default function ManageBillingButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const { url, error } = await res.json();
    if (url) window.location.href = url;
    else { alert(error || "Something went wrong"); setLoading(false); }
  }

  return (
    <button onClick={handleClick} disabled={loading} className="btn primary" style={{ cursor: loading ? "wait" : "pointer" }}>
      {loading ? "Loading…" : "Manage Subscription →"}
    </button>
  );
}
