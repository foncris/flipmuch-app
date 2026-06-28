import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";

// Uses the service-role key (server-only, never exposed to the browser) so it
// can write to profiles regardless of RLS policies.
function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
  }

  const admin = supabaseAdmin();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.client_reference_id;
      if (userId) {
        await admin
          .from("profiles")
          .update({
            stripe_customer_id: session.customer,
            subscription_status: "active",
          })
          .eq("id", userId);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const status = subscription.status === "active" || subscription.status === "trialing"
        ? "active"
        : "inactive";
      await admin
        .from("profiles")
        .update({ subscription_status: status })
        .eq("stripe_customer_id", subscription.customer);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
