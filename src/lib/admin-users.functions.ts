import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error("Permission check failed");
  if (!data) throw new Error("Forbidden: admin only");
}

export const listAppUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: usersData, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (usersErr) throw usersErr;

    const ids = usersData.users.map((u) => u.id);
    const [{ data: profiles }, { data: roles }, { data: perms }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("nav_permissions").select("user_id, nav_key").in("user_id", ids),
    ]);

    return usersData.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      full_name: profiles?.find((p) => p.id === u.id)?.full_name ?? null,
      roles: (roles ?? []).filter((r) => r.user_id === u.id).map((r) => r.role as string),
      nav_keys: (perms ?? []).filter((p) => p.user_id === u.id).map((p) => p.nav_key),
    }));
  });

export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { email: string; password: string; full_name: string; is_admin: boolean; nav_keys: string[] }) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        password: z.string().min(8).max(72),
        full_name: z.string().trim().min(1).max(100),
        is_admin: z.boolean(),
        nav_keys: z.array(z.string().min(1).max(50)).max(50),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw error;
    const newId = created.user!.id;

    // handle_new_user trigger may auto-grant 'user' role and 'admin' for first user.
    if (data.is_admin) {
      await supabaseAdmin.from("user_roles").upsert({ user_id: newId, role: "admin" }, { onConflict: "user_id,role" });
    }
    if (data.nav_keys.length) {
      await supabaseAdmin
        .from("nav_permissions")
        .insert(data.nav_keys.map((k) => ({ user_id: newId, nav_key: k })));
    }
    return { id: newId };
  });

export const updateUserPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string; is_admin: boolean; nav_keys: string[] }) =>
    z
      .object({
        user_id: z.string().uuid(),
        is_admin: z.boolean(),
        nav_keys: z.array(z.string().min(1).max(50)).max(50),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.is_admin) {
      await supabaseAdmin.from("user_roles").upsert({ user_id: data.user_id, role: "admin" }, { onConflict: "user_id,role" });
    } else {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).eq("role", "admin");
    }

    await supabaseAdmin.from("nav_permissions").delete().eq("user_id", data.user_id);
    if (data.nav_keys.length) {
      await supabaseAdmin
        .from("nav_permissions")
        .insert(data.nav_keys.map((k) => ({ user_id: data.user_id, nav_key: k })));
    }
    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string; password: string }) =>
    z.object({ user_id: z.string().uuid(), password: z.string().min(8).max(72) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password });
    if (error) throw error;
    return { ok: true };
  });

export const deleteAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string }) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.user_id === context.userId) throw new Error("You cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw error;
    return { ok: true };
  });
