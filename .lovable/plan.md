# Migrating Ledgerly off Lovable — full working checklist

Goal: run the app on your own infrastructure (your own database, your own AI provider, your own hosting) with every feature — including all AI assistants — working.

## What is Lovable-specific today

Only a handful of places depend on Lovable services:

- AI features (5 files): the business assistant, the admin access assistant, "ask your data", AI client paste/import, and AI client insights. All call the Lovable AI Gateway with `LOVABLE_API_KEY`.
- Google sign-in: goes through the Lovable auth broker.
- Click-to-call (Twilio): goes through the Lovable connector gateway.
- Database, auth, storage: Lovable Cloud (a managed Supabase project).

Everything else — UI, routing, dashboards, tables, permissions, RLS policies, SQL functions, business logic — is standard code and moves as-is.

## Step 1 — Get the code out

Connect GitHub in Lovable and sync the project to a repository (preferred, keeps history), or download the codebase zip from the code editor.

## Step 2 — Stand up your own database

1. Create a new Supabase project (or self-hosted Postgres + Supabase stack).
2. Apply the 121 migrations in `supabase/migrations` in order — this recreates all tables, RLS policies, grants, triggers and functions.
3. Export the current data from Lovable Cloud (Cloud tab → Advanced → Export data) and import it into the new project.
4. Recreate the auth users, or have the team re-register and relink employee records.
5. Recreate storage buckets and re-upload any attachments.

## Step 3 — Replace the AI provider

Pick an AI provider (OpenAI, Anthropic, Google, or an OpenAI-compatible gateway such as OpenRouter). The app already uses the Vercel AI SDK, so the change is small and local:

- Swap the gateway base URL/key setup for the provider's own SDK client in the 5 AI files.
- Replace the model id `openai/gpt-5.6-sol` with the provider's equivalent model.
- Remove the Lovable-specific request headers and the run-id fetch wrapper.
- Keep all tools, prompts and streaming behaviour unchanged.

Result: the business assistant, admin assistant, ask-your-data, AI client paste and AI insights keep working exactly as they do now.

## Step 4 — Replace the auth broker and Twilio connector

- Google sign-in: configure Google OAuth directly in your Supabase project and switch the sign-in button to Supabase's own OAuth call. (Email/password logins keep working untouched.)
- Click-to-call: create a Twilio account, put the Twilio credentials in your own environment variables, and call Twilio's API directly instead of the connector gateway. If click-to-call is not important, this feature can simply be removed.

## Step 5 — Environment variables on the new host

Set: Supabase URL, publishable key and service role key (both the `VITE_` and server variants), your AI provider API key, and Twilio credentials if used. Nothing named `LOVABLE_*` remains.

## Step 6 — Deploy

The app is TanStack Start on Vite. Deploy to Cloudflare Workers/Pages (closest to the current runtime, least friction), or Vercel/Netlify/any Node host — a small build target adjustment may be needed for non-Cloudflare hosts.

## Step 7 — Verify, then retire the Lovable project

Test on the new deployment: login, dashboard currency switching, income/withdrawals/deposit requests, permissions per role, all five AI features, exports. Only after that, stop using or disconnect the Lovable project — disconnecting Lovable Cloud permanently deletes the cloud data.

## Technical notes

- AI files to change: `src/routes/api/business-chat.ts`, `src/routes/api/admin-chat.ts`, `src/lib/ask.functions.ts`, `src/lib/client-import.functions.ts`, `src/lib/client-insight.functions.ts`.
- Auth broker file: `src/integrations/lovable/index.ts` (plus its call site on the auth page). Package `@lovable.dev/cloud-auth-js` can then be removed.
- Twilio: `src/lib/voip.server.ts` currently posts to `https://connector-gateway.lovable.dev/twilio`; replace with direct Twilio REST calls using `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`.
- `vite.config.ts` uses `@lovable.dev/vite-tanstack-config`; on a non-Lovable host replace it with a plain TanStack Start Vite config (tanstackStart, react, tailwind, tsconfig paths, nitro preset).
- Public API routes under `src/routes/api/public/*` lose Lovable's preview auth wrapper; their own in-handler checks still apply.

## What I can do for you here

If you want, I can do Step 3 and Step 4 inside this project now (make the AI and Twilio layers provider-agnostic and driven by plain env vars), so the exported code is already portable and only needs keys on the new host.
