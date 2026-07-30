import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Permission check failed");
  if (!data) throw new Error("Forbidden: platform owner only");
}

/** Context for the signed-in user: their company + whether they own the platform. */
export const getCompanyContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: membership }, { data: superRow }] = await Promise.all([
      supabase.from("company_users").select("company_id").eq("user_id", userId).maybeSingle(),
      supabase.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle(),
    ]);

    const isSuperAdmin = !!superRow;
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name, slug, active")
      .order("name");

    const companyId = membership?.company_id ?? null;
    return {
      companyId,
      isSuperAdmin,
      companies: companies ?? [],
      company: (companies ?? []).find((c) => c.id === companyId) ?? null,
    };
  });

/** Platform owner switches which company they are working in. */
export const switchCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { company_id: string }) => z.object({ company_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("company_users")
      .update({ company_id: data.company_id })
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const listCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: companies, error } = await supabaseAdmin
      .from("companies")
      .select("id, name, slug, active, created_at")
      .order("created_at");
    if (error) throw error;

    const { data: members } = await supabaseAdmin.from("company_users").select("company_id");

    return (companies ?? []).map((c) => ({
      ...c,
      member_count: (members ?? []).filter((m) => m.company_id === c.id).length,
    }));
  });

export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { name: string; admin_email: string; admin_password: string; admin_full_name: string }) =>
      z
        .object({
          name: z.string().trim().min(2).max(80),
          admin_email: z.string().trim().email().max(255),
          admin_password: z.string().min(8).max(72),
          admin_full_name: z.string().trim().min(1).max(100),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const baseSlug =
      data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "company";
    let slug = baseSlug;
    for (let i = 2; i < 50; i++) {
      const { data: existing } = await supabaseAdmin.from("companies").select("id").eq("slug", slug).maybeSingle();
      if (!existing) break;
      slug = `${baseSlug}-${i}`;
    }

    const { data: company, error: cErr } = await supabaseAdmin
      .from("companies")
      .insert({ name: data.name, slug })
      .select("id")
      .single();
    if (cErr) throw cErr;

    const { data: created, error: uErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.admin_email,
      password: data.admin_password,
      email_confirm: true,
      user_metadata: { full_name: data.admin_full_name },
    });
    if (uErr) {
      await supabaseAdmin.from("companies").delete().eq("id", company.id);
      throw uErr;
    }
    const adminId = created.user!.id;

    await supabaseAdmin.from("company_users").upsert(
      { user_id: adminId, company_id: company.id },
      { onConflict: "user_id" },
    );
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: adminId, role: "admin" }, { onConflict: "user_id,role" });

    return { id: company.id, slug };
  });

export const updateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { company_id: string; name?: string; active?: boolean }) =>
    z
      .object({
        company_id: z.string().uuid(),
        name: z.string().trim().min(2).max(80).optional(),
        active: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { name?: string; active?: boolean } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.active !== undefined) patch.active = data.active;
    if (!Object.keys(patch).length) return { ok: true };
    const { error } = await supabaseAdmin.from("companies").update(patch).eq("id", data.company_id);
    if (error) throw error;
    return { ok: true };
  });
