import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DriverAuthRequest = {
  personnelResourceId?: string;
  profileId?: string;
  organizationId?: string;
  fullName?: string;
  email?: string;
  password?: string;
  vehicleName?: string;
  jobVisibility?: string;
  mobile?: string;
  licenseClasses?: string[];
  maxDailyHours?: number;
  resourceType?: string;
  operationType?: string;
  archivedAt?: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt." }, 500);
  }

  const body = (await req.json()) as DriverAuthRequest;
  const personnelResourceId = cleanText(body.personnelResourceId);
  const fullName = cleanText(body.fullName);
  const email = cleanText(body.email).toLowerCase();
  const password = cleanText(body.password);

  if (!personnelResourceId || !fullName) {
    return jsonResponse({ error: "personnelResourceId und fullName sind erforderlich." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let profileId = cleanText(body.profileId);
  if (email) {
    if (profileId) {
      const updatePayload: Record<string, unknown> = {
        email,
        user_metadata: { full_name: fullName },
      };
      if (password) updatePayload.password = password;
      const { error } = await admin.auth.admin.updateUserById(profileId, updatePayload);
      if (error && error.status !== 404) return jsonResponse({ error: error.message }, 400);
      if (error?.status === 404) profileId = "";
    }

    if (!profileId) {
      const { data: listedUsers, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listError) return jsonResponse({ error: listError.message }, 400);
      profileId = listedUsers.users.find((user) => user.email?.toLowerCase() === email)?.id ?? "";
    }

    if (!profileId) {
      if (!password) return jsonResponse({ error: "Fuer neue Fahrer ist ein Passwort erforderlich." }, 400);
      const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createError) return jsonResponse({ error: createError.message }, 400);
      profileId = createdUser.user.id;
    }

    const { error: profileError } = await admin.from("profiles").upsert({
      id: profileId,
      full_name: fullName,
      email,
      role: "driver",
      organization_id: body.organizationId || null,
      vehicle_name: body.vehicleName ?? "",
      job_visibility: body.jobVisibility ?? "assigned_only",
    });
    if (profileError) return jsonResponse({ error: profileError.message }, 400);
  }

  const { error: personnelError } = await admin.from("personnel_resources").upsert({
    id: personnelResourceId,
    profile_id: profileId || null,
    organization_id: body.organizationId || null,
    full_name: fullName,
    email,
    access_password: password,
    vehicle_name: body.vehicleName ?? "",
    job_visibility: body.jobVisibility ?? "assigned_only",
    mobile: body.mobile ?? "",
    license_classes: body.licenseClasses ?? [],
    max_daily_hours: body.maxDailyHours ?? 8,
    resource_type: body.resourceType ?? "Personal",
    operation_type: body.operationType ?? "",
    archived_at: body.archivedAt ?? null,
  }, { onConflict: "id" });
  if (personnelError) return jsonResponse({ error: personnelError.message }, 400);

  return jsonResponse({ personnelResourceId, profileId: profileId || null });
});
