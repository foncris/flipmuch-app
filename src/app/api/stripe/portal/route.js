import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getProfile } from "@/lib/supabase/server";

export async function POST(request) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!profile.stripe_customer_id) return NextResponse.json({ error: "No subscription found" }, { status: 400 });

  const { origin } = new URL(request.url);
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${origin}/billing`,
  });

  return NextResponse.json({ url: session.url });
}
