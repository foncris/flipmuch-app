import { redirect } from "next/navigation";
import { getProfile } from "@/lib/supabase/server";
import AdminParams from "@/components/AdminParams";

export default async function AdminParamsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/app");

  return <AdminParams />;
}
