# Admin Assistant — chat that can change permissions

An admin-only chat where you type things like "give Alex the same access as Jack, but no delete" and the assistant proposes the exact change, shows it, and applies it only after you press Apply.

## What you get

- A new **Admin assistant** page, reachable from the admin area (next to Users / Permissions), visible only to workspace admins.
- **Multiple conversations** with a thread list, a "New chat" button, and its own URL per thread so you can reload or share a link and land back in the same conversation.
- Conversations and messages are **saved to the backend**, scoped to your workspace and your user, so they follow you across devices.
- Streaming answers with a typing indicator, markdown rendering, and a focused input box.

## What it can do

Read-only (answers immediately):
- Who has access to what page and action, what role each member has, what a specific person can and cannot do, and why (role default vs. per-user override).
- Compare two members' access.

Changes (always confirmation-gated):
- Grant/revoke page access for a member.
- Grant/revoke action permissions (delete, export, etc.) for a member.
- Change a member's role.
- Copy one member's access to another.

Every proposed change renders as a **change card** inside the chat: who, what changes from → to, and Apply / Discard buttons. Nothing is written until Apply is pressed. Applied changes are recorded in the existing activity log.

Anything outside permissions and roles (creating employees, editing sources, financial edits) is refused with a short explanation, so the assistant can't touch business data.

## Safety

- The page and every action are admin-only, re-checked on the server for each request — a non-admin cannot reach it even by URL.
- The assistant can only propose changes for members of your own workspace.
- It cannot grant anyone permissions you don't already have, and cannot change your own role (avoids locking yourself out of admin).

## Technical notes

- New tables `admin_chat_threads` and `admin_chat_messages` (company-scoped, RLS restricted to the owning admin, with GRANTs), storing AI SDK `UIMessage[]` parts.
- Route `src/routes/_authenticated/assistant.$threadId.tsx` plus an index that creates a thread and navigates to it; chat window keyed by `threadId`.
- Streaming server route `src/routes/api/admin-chat.ts` using the AI SDK with the Lovable AI Gateway (`openai/gpt-5.6-sol` via the Responses API, matching the existing "Ask your data" setup), persisting assistant messages in `onFinish`.
- Tools: read tools (`list_members`, `get_effective_permissions`, `compare_members`) execute directly against the caller's Supabase client; mutation tools (`set_page_access`, `set_action_permission`, `set_role`, `copy_access`) are declared with `needsApproval` so they render as approval cards and only run after Apply.
- Mutations reuse the existing permission model (`role_permissions`, `user_permission_overrides`, `company_users.role_key`, `effective_permission` RPC) — no new permission semantics.
- UI built from AI Elements (`conversation`, `message`, `prompt-input`, `tool`, `shimmer`), with a custom compact card for the permission-diff tool output.
