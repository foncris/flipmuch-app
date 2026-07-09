import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import { createClient as createServerClient } from "@supabase/supabase-js";

function adminSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export default async function AdminUsersPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/app");

  const supabase = adminSupabase();
  const { data: users } = await supabase
    .from("profiles")
    .select("id, email, role, subscription_status, stripe_customer_id, created_at")
    .order("created_at", { ascending: false });

  const counts = {
    total: users?.length ?? 0,
    active: users?.filter(u => u.subscription_status === "active").length ?? 0,
    trialing: users?.filter(u => u.subscription_status === "trialing").length ?? 0,
    inactive: users?.filter(u => !u.subscription_status || u.subscription_status === "inactive").length ?? 0,
  };

  const statusColor = (s) => ({
    active: "#16a34a", trialing: "#d97706", inactive: "#6b7280", cancelled: "#dc2626"
  }[s] ?? "#6b7280");

  return (
    <main style={{ padding: "40px 32px", maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ color: "var(--navy)", fontSize: 24, fontWeight: 800, marginBottom: 6 }}>Subscribers</h1>
      <p style={{ color: "var(--muted)", marginBottom: 32 }}>All registered users and their subscription status.</p>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
        {[
          { label: "Total Users", value: counts.total, color: "var(--navy)" },
          { label: "Active", value: counts.active, color: "#16a34a" },
          { label: "Trialing", value: counts.trialing, color: "#d97706" },
          { label: "Inactive", value: counts.inactive, color: "#6b7280" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "16px 24px", minWidth: 120 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "var(--cream)", borderBottom: "1px solid var(--line)" }}>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--muted)", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Email</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--muted)", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Status</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--muted)", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Role</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--muted)", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Stripe ID</th>
              <th style={{ padding: "12px 16px", textAlign: "left", color: "var(--muted)", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u, i) => (
              <tr key={u.id} style={{ borderBottom: "1px solid var(--line)", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ padding: "12px 16px", color: "var(--ink)", fontWeight: 500 }}>{u.email}</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ background: statusColor(u.subscription_status) + "18", color: statusColor(u.subscription_status), fontWeight: 700, fontSize: 12, padding: "3px 10px", borderRadius: 20 }}>
                    {u.subscription_status ?? "—"}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", color: "var(--muted)" }}>{u.role ?? "user"}</td>
                <td style={{ padding: "12px 16px", color: "var(--muted)", fontFamily: "monospace", fontSize: 12 }}>{u.stripe_customer_id ?? "—"}</td>
                <td style={{ padding: "12px 16px", color: "var(--muted)" }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
            {!users?.length && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>No users yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
