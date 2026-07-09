import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import ManageBillingButton from "@/components/ManageBillingButton";

export default async function BillingPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const statusLabel = {
    active: "Active",
    trialing: "Free Trial",
    inactive: "Inactive",
    cancelled: "Cancelled",
  }[profile.subscription_status] ?? profile.subscription_status ?? "—";

  const statusColor = (profile.subscription_status === "active" || profile.subscription_status === "trialing")
    ? "#16a34a" : "#dc2626";

  return (
    <main className="container" style={{ maxWidth: 560, margin: "60px auto", padding: "0 20px" }}>
      <h1 style={{ color: "var(--navy)", fontSize: 26, fontWeight: 800, marginBottom: 8 }}>Billing & Subscription</h1>
      <p style={{ color: "var(--muted)", marginBottom: 36 }}>Manage your GoingFlip subscription.</p>

      <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: "28px 28px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)", marginBottom: 4 }}>Plan</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "var(--navy)" }}>Fix &amp; Flip Ops Monthly</div>
            <div style={{ color: "var(--muted)", fontSize: 14, marginTop: 2 }}>$19 / month</div>
          </div>
          <div style={{ background: statusColor + "18", color: statusColor, fontWeight: 700, fontSize: 13, padding: "5px 14px", borderRadius: 20 }}>
            {statusLabel}
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
            Account: <strong style={{ color: "var(--ink)" }}>{profile.email}</strong>
          </div>
          {profile.stripe_customer_id ? (
            <ManageBillingButton />
          ) : (
            <a href="/app" className="btn primary" style={{ display: "inline-block", textDecoration: "none" }}>
              Activate Subscription
            </a>
          )}
        </div>
      </div>

      <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
        Cancellations take effect at the end of your current billing period. 
        To get help, email <a href="mailto:support@goingflip.com" style={{ color: "var(--navy)" }}>support@goingflip.com</a>.
      </p>
    </main>
  );
}
