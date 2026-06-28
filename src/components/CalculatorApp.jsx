"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export default function CalculatorApp({ deals: initialDeals }) {
  const supabase = createClient();
  const iframeRef = useRef(null);
  const pendingExport = useRef(null); // { requestId, resolve }
  const [ready, setReady] = useState(false);
  const [deals, setDeals] = useState(initialDeals);
  const [activeDealId, setActiveDealId] = useState(null);
  const [dealName, setDealName] = useState("Untitled deal");
  const [status, setStatus] = useState("");
  const [iframeKey, setIframeKey] = useState(0);

  // Push the global Program Parameters into the iframe once it announces ready.
  const pushParams = useCallback(async () => {
    const { data: row } = await supabase
      .from("program_params")
      .select("data")
      .eq("id", 1)
      .single();
    if (row?.data && Object.keys(row.data).length > 0) {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "flipmuch:set-params", params: row.data },
        "*"
      );
    }
  }, [supabase]);

  useEffect(() => {
    function handleMessage(event) {
      const msg = event.data || {};
      if (msg.type === "flipmuch:ready") {
        setReady(true);
        pushParams();
      } else if (msg.type === "flipmuch:deal-data" && pendingExport.current) {
        if (msg.requestId === pendingExport.current.requestId) {
          pendingExport.current.resolve(msg.data);
          pendingExport.current = null;
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [pushParams]);

  function requestExport() {
    return new Promise((resolve) => {
      const requestId = Math.random().toString(36).slice(2);
      pendingExport.current = { requestId, resolve };
      iframeRef.current?.contentWindow?.postMessage(
        { type: "flipmuch:request-export", requestId },
        "*"
      );
    });
  }

  async function handleSave() {
    setStatus("Saving…");
    const data = await requestExport();
    let name = dealName;
    if (!activeDealId) {
      name = window.prompt("Name this deal (e.g. the property address):", dealName) || dealName;
      setDealName(name);
    }

    if (activeDealId) {
      const { error } = await supabase
        .from("deals")
        .update({ name, data })
        .eq("id", activeDealId);
      if (error) { setStatus(`Save failed: ${error.message}`); return; }
    } else {
      const { data: inserted, error } = await supabase
        .from("deals")
        .insert({ name, data })
        .select("id, name, updated_at")
        .single();
      if (error) { setStatus(`Save failed: ${error.message}`); return; }
      setActiveDealId(inserted.id);
      setDeals((prev) => [inserted, ...prev]);
    }
    setStatus("Saved.");
    refreshDealsList();
    setTimeout(() => setStatus(""), 2000);
  }

  async function refreshDealsList() {
    const { data } = await supabase
      .from("deals")
      .select("id, name, updated_at")
      .order("updated_at", { ascending: false });
    if (data) setDeals(data);
  }

  async function handleLoad(deal) {
    setStatus("Loading…");
    const { data: row, error } = await supabase
      .from("deals")
      .select("data")
      .eq("id", deal.id)
      .single();
    if (error) { setStatus(`Load failed: ${error.message}`); return; }
    setActiveDealId(deal.id);
    setDealName(deal.name);
    iframeRef.current?.contentWindow?.postMessage(
      { type: "flipmuch:load-deal", data: row.data },
      "*"
    );
    setStatus("");
  }

  async function handleDelete(deal) {
    if (!window.confirm(`Delete "${deal.name}"? This can't be undone.`)) return;
    await supabase.from("deals").delete().eq("id", deal.id);
    if (activeDealId === deal.id) {
      setActiveDealId(null);
      setDealName("Untitled deal");
    }
    refreshDealsList();
  }

  function handleNew() {
    setActiveDealId(null);
    setDealName("Untitled deal");
    setReady(false);
    setIframeKey((k) => k + 1); // remount iframe to reset all fields
  }

  return (
    <main className="container" style={{ maxWidth: 1300 }}>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <aside className="card" style={{ width: 240, flexShrink: 0, padding: 16 }}>
          <button className="btn primary" style={{ width: "100%", marginBottom: 12 }} onClick={handleNew}>
            + New deal
          </button>
          <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", marginBottom: 6 }}>
            Saved deals
          </div>
          {deals.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No saved deals yet.</p>}
          {deals.map((d) => (
            <div
              key={d.id}
              style={{
                padding: "8px 6px",
                borderRadius: 5,
                marginBottom: 4,
                background: d.id === activeDealId ? "var(--cream)" : "transparent",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 6,
              }}
            >
              <button
                onClick={() => handleLoad(d)}
                style={{
                  background: "none", border: "none", padding: 0, textAlign: "left",
                  cursor: "pointer", fontSize: 13.5, color: "var(--navy)", flex: 1,
                }}
                title={d.name}
              >
                {d.name}
              </button>
              <button
                onClick={() => handleDelete(d)}
                title="Delete"
                style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 13 }}
              >
                ✕
              </button>
            </div>
          ))}
        </aside>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <strong style={{ color: "var(--navy)" }}>{dealName}</strong>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 13 }}>{status}</span>
              <button className="btn primary" onClick={handleSave} disabled={!ready}>
                Save deal
              </button>
            </div>
          </div>
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src="/calculator.html"
            title="Fix & Flip Deal Analyzer"
            style={{ width: "100%", height: "calc(100vh - 220px)", border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }}
          />
        </div>
      </div>
    </main>
  );
}
