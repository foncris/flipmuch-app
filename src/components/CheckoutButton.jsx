"use client";

import { useState } from "react";

export default function CheckoutButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const res = await fetch("/api/stripe/checkout", { method: "POST" });
    const { url, error } = await res.json();
    if (error) {
      alert(error);
      setLoading(false);
      return;
    }
    window.location.href = url;
  }

  return (
    <button className="btn primary" onClick={handleClick} disabled={loading}>
      {loading ? "Redirecting…" : "Subscribe"}
    </button>
  );
}
