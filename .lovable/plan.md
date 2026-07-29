## Goal

Whenever a client marked **Low potential** receives a deposit that pushes their balance above $250, admins get an in-app alert: a bell in the top bar with an unread count, plus a toast while they're using the app.

## How it works

1. **Notifications table** (`notifications`): message, type, link to the client, related client/lead name, amount, created date, and a read/unread flag. Admin-only read access; rows are created by the database itself.
2. **Automatic trigger on deposits**: when a revenue entry is saved, the database checks whether the customer matches a client whose potential is `low`. It sums the client's base balance ($250) plus all recorded deposits, and if the total has just crossed $250 for the first time, it writes one notification row. A "already notified" marker on the client prevents repeat alerts for the same client on later deposits.
3. **Bell in the top bar** (in the app header next to the search/profile controls): shows the unread count, opens a dropdown listing recent alerts with lead name, amount and date. Clicking an alert opens the Clients page filtered to that client and marks it read. A "Mark all read" action clears the badge.
4. **Live toast**: the app subscribes to new notification rows in real time, so a toast appears immediately for admins who are online when a qualifying deposit is recorded.

Notifications stay visible in the bell list (read/unread) so nothing is lost if you were offline.

## Technical notes

- Migration: create `public.notifications` (id, type, title, body, lead_activation_id, amount, created_at, read_at) with GRANTs, RLS enabled, admin-only SELECT/UPDATE via `has_role(auth.uid(),'admin')`, inserts done by a `SECURITY DEFINER` trigger function.
- Add `low_potential_alerted boolean not null default false` to `daily_lead_activations` as the idempotency flag.
- Trigger `AFTER INSERT ON public.revenue`: matches `lower(trim(customer_name))` against `daily_lead_activations.lead_name` (same matching rule the Clients page uses), computes effective balance = `balance` + sum of all revenue for that name, and inserts a notification when potential = 'low', effective balance > 250, and the flag is false; then sets the flag.
- Frontend: `src/components/notification-bell.tsx` (TanStack Query for the list + unread count, `supabase.channel` postgres_changes INSERT subscription → `toast()` from sonner and query invalidation), mounted in the header in `src/routes/_authenticated/route.tsx`, hidden for non-admins.
- Enable realtime on the notifications table (`REPLICA IDENTITY FULL` + add to `supabase_realtime` publication).
