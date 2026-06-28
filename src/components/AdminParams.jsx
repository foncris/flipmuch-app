"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

// Reuses the calculator's own (already-tested) Program Parameters panel
// instead of re-implementing ~80 underwriting fields in React. This page
// is role-gated server-side, so it tells the iframe to skip its local PIN
// gate and loads/saves the matrix from the program_params table instead
// of localStorage.
export default function AdminParams() {
  const supabase = createClient();
  const iframeRef = useRef(null);
  const pendingRequest = useRef(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Loading current parameters…");

  const loadServerParams = useCallback(async () => {
    const { data: row } = await supabase
      .from("program_params")
      .select("data")
      .eq("id", 1)
      .single();
    iframeRef.current?.contentWindow?.postMessage({ type: "flipmuch:admin-unlock" }, "*");
    if (row?.data && Object.keys(row.data).length > 0) {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "flipmuch:set-params", params: row.data },
        "*"
      );
      setStatus("Loaded current program parameters from the database.");
    } else {
      setStatus("No saved parameters yet — showing program defaults. Edit and save to set them.");
    }
  }, [supabase]);

  useEffect(() => {
    function handleMessage(event) {
      const msg = event.data || {};
      if (msg.type === "flipmuch:ready") {
        setReady(true);
        loadServerParams();
      } else if (msg.type === "flipmuch:params-data" && pendingRequest.current) {
        if (msg.requestId === pendingRequest.current.requestId) {
          pendingRequest.current.resolve(msg.params);
          pendingRequest.current = null;
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [loadServerParams]);

  function requestParams() {
    return new Promise((resolve) => {
      const requestId = Math.random().toString(36).slice(2);
      pendingRequest.current = { requestId, resolve };
      iframeRef.current?.contentWindow?.postMessage(
        { type: "flipmuch:request-params", requestId },
        "*"
      );
    });
  }

  async function handleSave() {
    setStatus("Saving…");
    const params = await requestParams();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("program_params")
      .upsert({ id: 1, data: params, updated_by: user.id, updated_at: new Date().toISOString() });

    setStatus(error ? `Save failed: ${error.message}` : "Saved. All subscribers will get these values on next load.");
  }

  return (
    <main className="container" style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h2 style={{ color: "var(--navy)", margin: 0 }}>Program Parameters (Admin)</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 13 }}>{status}</span>
          <button className="btn primary" onClick={handleSave} disabled={!ready}>
            Save to all users
          </button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 14 }}>
        Edit the underwriting matrix below (rates, points, leverage caps, overlays, fee schedule).
        Changes only take effect for subscribers after you click "Save to all users".
      </p>
      <iframe
        ref={iframeRef}
        src="/calculator.html"
        title="Program Parameters"
        style={{ width: "100%", height: "calc(100vh - 220px)", border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }}
      />
    </main>
  );
}
