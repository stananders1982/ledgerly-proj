import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/** Landing route: resume the most recent conversation or start a new one. */
export const Route = createFileRoute("/_authenticated/assistant/")({
  beforeLoad: async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;

    const { data: existing } = await supabase
      .from("admin_chat_threads")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) throw redirect({ to: "/assistant/$threadId", params: { threadId: existing.id } });

    const { data: member } = await supabase
      .from("company_users")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!member?.company_id) return;

    const { data: created } = await supabase
      .from("admin_chat_threads")
      .insert({ company_id: member.company_id, user_id: userId, title: "New chat" })
      .select("id")
      .single();

    if (created?.id) throw redirect({ to: "/assistant/$threadId", params: { threadId: created.id } });
  },
  component: () => null,
});
