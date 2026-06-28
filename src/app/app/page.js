import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";
import CalculatorApp from "@/components/CalculatorApp";
import CheckoutButton from "@/components/CheckoutButton";

export default async function AppPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const isActive = profile.subscription_status === "active" || profile.role === "admin";

  if (!isActive) {
    return (
      <main className="container">
        <div className="card" style={{ maxWidth: 480, margin: "60px auto", textAlign: "center" }}>
          <h2 style={{ color: "var(--navy)", marginTop: 0 }}>Start your subscription</h2>
          <p className="muted">
            Your trial hasn't been activated yet. Subscribe to unlock the deal analyzer.
          </p>
          <CheckoutButton />
        </div>
      </main>
    );
  }

  const supabase = await createClient();

  const { data: deals } = await supabase
    .from("deals")
    .select("id, name, updated_at")
    .order("updated_at", { ascending: false });

  return <CalculatorApp deals={deals || []} />;
}
