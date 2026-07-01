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

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <main className="container" style={{ maxWidth: 1300, padding: "0 0 40px" }}>
      <style>{`
        .calc-layout{display:flex;gap:24px;align-items:flex-start;padding:20px 24px 0;}
        .calc-sidebar{width:240px;flex-shrink:0;}
        .calc-main{flex:1;min-width:0;overflow:hidden;}
        .calc-topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}
        .sidebar-toggle{display:none;}
        .calc-iframe{width:100%;height:calc(100vh - 220px);border:1px solid var(--line);border-radius:8px;background:#fff;display:block;overflow:hidden;}
        @media(max-width:640px){
          .calc-layout{flex-direction:column;padding:6px 0 0;gap:0;}
          .calc-sidebar{width:100%;border-bottom:1px solid var(--line);margin-bottom:8px;padding:0 12px;box-sizing:border-box;}
          .sidebar-toggle{display:flex;align-items:center;justify-content:space-between;width:100%;background:none;border:none;padding:10px 0;font-size:14px;font-weight:600;color:var(--navy);cursor:pointer;}
          .sidebar-deals{display:none;}
          .sidebar-deals.open{display:block;padding-bottom:10px;}
          .calc-topbar{flex-wrap:wrap;gap:8px;padding:0 12px;box-sizing:border-box;}
          .calc-iframe{height:calc(100vh - 140px);border-radius:0;border-left:none;border-right:none;width:100vw;max-width:100vw;}
        }
        @media(min-width:641px){
          .sidebar-toggle{display:none!important;}
          .sidebar-deals{display:block!important;}
        }
      `}</style>

      <div className="calc-layout">
        <aside className="card calc-sidebar" style={{ padding: 16 }}>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(o => !o)}>
            <span>☰ Deals</span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{sidebarOpen ? "▲ close" : "▼ open"}</span>
          </button>
          <div className={`sidebar-deals${sidebarOpen ? " open" : ""}`}>
            <button className="btn primary" style={{ width: "100%", marginBottom: 12 }} onClick={() => { handleNew(); setSidebarOpen(false); }}>
              + New deal
            </button>
            <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", marginBottom: 6 }}>Saved deals</div>
            {deals.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No saved deals yet.</p>}
            {deals.map((d) => (
              <div key={d.id} style={{ padding: "8px 6px", borderRadius: 5, marginBottom: 4, background: d.id === activeDealId ? "var(--cream)" : "transparent", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                <button onClick={() => { handleLoad(d); setSidebarOpen(false); }} style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontSize: 13.5, color: "var(--navy)", flex: 1 }} title={d.name}>{d.name}</button>
                <button onClick={() => handleDelete(d)} title="Delete" style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 13 }}>✕</button>
              </div>
            ))}
          </div>
        </aside>

        <div className="calc-main">
          <div className="calc-topbar">
            <strong style={{ color: "var(--navy)", fontSize: 15 }}>{dealName}</strong>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 13 }}>{status}</span>
              <button className="btn primary" onClick={handleSave} disabled={!ready}>Save deal</button>
            </div>
          </div>
          <iframe key={iframeKey} ref={iframeRef} src="/calculator.html" title="Fix & Flip Deal Analyzer" className="calc-iframe" />
        </div>
      </div>
    </main>
  );
}
