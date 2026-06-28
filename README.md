# flipmuch

Fix & flip deal analyzer — multi-tenant SaaS. Next.js (App Router, JS) + Supabase (auth/db) + Stripe (billing). The calculator itself (`public/calculator.html`) is the original, already-tested vanilla-JS analyzer, embedded via iframe and wired to the database with `postMessage` — its calculation logic is untouched.

## What's here

- `src/app` — marketing page, login/signup, the protected `/app` calculator route, and the admin `/admin/params` page
- `src/components` — `CalculatorApp` (save/load deals, push program params into the iframe), `AdminParams` (edit the global underwriting matrix), `Nav`, auth helpers
- `src/lib/supabase` — browser/server Supabase clients + middleware session refresh
- `src/app/api/stripe` — checkout session creation + webhook handler
- `public/calculator.html` — the deal analyzer, with additive `postMessage` hooks (`flipmuch:ready`, `flipmuch:request-export`, `flipmuch:load-deal`, `flipmuch:set-params`, `flipmuch:admin-unlock`, `flipmuch:request-params`) layered on top of the existing export/import/params logic
- `supabase/schema.sql` — `profiles`, `deals`, `program_params` tables, RLS policies, and the auto-create-profile trigger

## 1. Supabase setup

1. Create a project at supabase.com.
2. Project Settings → API: copy the URL, anon key, and service_role key into `.env.local` (copy `.env.example` first).
3. SQL Editor → New query → paste `supabase/schema.sql` → Run.
4. After you sign up in the app once, promote yourself to admin:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
5. Authentication → URL Configuration: add your deployed URL (and `http://localhost:3000` for local dev) to Redirect URLs, so `/auth/callback` works.

## 2. Stripe setup

1. Create a Product + a recurring Price in the Stripe dashboard; copy the Price ID into `STRIPE_PRICE_ID`.
2. Developers → API keys: copy the secret key into `STRIPE_SECRET_KEY`.
3. Developers → Webhooks → Add endpoint → `https://yourdomain.com/api/stripe/webhook`, events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. For local testing, use the Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

## 3. Run locally

```
npm install
cp .env.example .env.local   # then fill in the values above
npm run dev
```

Visit `localhost:3000`, sign up, subscribe (test mode), and you'll land on the calculator at `/app`.

## 4. Deploy (Vercel)

1. Push this folder to a GitHub repo.
2. Vercel → New Project → import the repo.
3. Add the six env vars from `.env.example` in Vercel project settings.
4. Deploy. Update the Stripe webhook endpoint and Supabase redirect URL to the production domain.

## Notes

- The admin Program Parameters page reuses the calculator's own existing settings panel (not a separate React form) so the underwriting math can't drift from what's already been validated. It bypasses the panel's local PIN gate because the `/admin/params` route is already role-gated server-side — the PIN was only ever a UI deterrent, not real security.
- Per project scope: only the Fix & Flip RTL underwriting matrix is modeled in Program Parameters. Bridge Loan and Ground-Up Construction terms are intentionally not included and shouldn't be added here.
- Deals are stored per-user in `deals.data` as the exact JSON shape the calculator already exports/imports — no reformatting.
