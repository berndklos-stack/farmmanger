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

function formatSupabaseError(error: unknown) {
  if (!error) return "Unbekannter Supabase-Fehler.";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const values = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [values.message, values.details, values.hint, values.code]
      .filter((value) => typeof value === "string" && value && value !== "{}");
    if (parts.length > 0) return parts.join(" · ");
    return JSON.stringify(error);
  }
  return String(error);
}

async function ensureExistingProfileCanBeUsed(admin: ReturnType<typeof createClient>, profileId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("role, email")
    .eq("id", profileId)
    .limit(1);
  if (error) return `Profilpruefung fehlgeschlagen: ${formatSupabaseError(error)}`;
  const profile = data?.[0];
  if (profile && profile.role !== "driver") {
    return "Diese E-Mail wird bereits fuer einen Admin- oder Landwirt-Zugang verwendet. Bitte fuer den Fahrer eine eigene E-Mail-Adresse verwenden.";
  }
  return "";
}

async function ensureEmailCanBeUsed(admin: ReturnType<typeof createClient>, email: string, profileId: string, personnelResourceId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, role, full_name")
    .eq("email", email)
    .limit(10);
  if (error) return `E-Mail-Pruefung fehlgeschlagen: ${formatSupabaseError(error)}`;
  const profileIds = (data ?? []).map((profile) => profile.id);
  const { data: linkedPersonnel, error: personnelError } = profileIds.length > 0
    ? await admin
      .from("personnel_resources")
      .select("id, profile_id, archived_at")
      .in("profile_id", profileIds)
      .limit(20)
    : { data: [], error: null };
  if (personnelError) return `Personalpruefung fehlgeschlagen: ${formatSupabaseError(personnelError)}`;

  const conflictingProfile = data?.find((profile) => {
    if (profile.id === profileId) return false;
    const linkedPerson = linkedPersonnel?.find((person) => person.profile_id === profile.id);
    if (linkedPerson?.id === personnelResourceId) return false;
    return true;
  });
  if (!conflictingProfile) return "";
  const roleLabel = conflictingProfile.role === "driver" ? "einen anderen Fahrer" : "einen Admin- oder Landwirt-Zugang";
  return `Diese E-Mail wird bereits fuer ${roleLabel} verwendet (${conflictingProfile.full_name ?? email}). Bitte eine eigene Fahrer-E-Mail verwenden.`;
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
  if (!profileId) {
    const { data: existingPersonnel, error: existingPersonnelError } = await admin
      .from("personnel_resources")
      .select("profile_id")
      .eq("id", personnelResourceId)
      .maybeSingle();
    if (existingPersonnelError) {
      return jsonResponse({ error: `Personalstamm konnte nicht gelesen werden: ${formatSupabaseError(existingPersonnelError)}` }, 400);
    }
    profileId = cleanText(existingPersonnel?.profile_id);
  }

  if (email) {
    const emailError = await ensureEmailCanBeUsed(admin, email, profileId, personnelResourceId);
    if (emailError) return jsonResponse({ error: emailError }, 400);

    if (profileId) {
      const existingProfileError = await ensureExistingProfileCanBeUsed(admin, profileId);
      if (existingProfileError) return jsonResponse({ error: existingProfileError }, 400);
      const updatePayload: Record<string, unknown> = {
        email,
        user_metadata: { full_name: fullName },
      };
      if (password) updatePayload.password = password;
      const { error } = await admin.auth.admin.updateUserById(profileId, updatePayload);
      if (error && error.status !== 404) return jsonResponse({ error: `Auth-User konnte nicht aktualisiert werden: ${formatSupabaseError(error)}` }, 400);
      if (error?.status === 404) profileId = "";
    }

    if (!profileId) {
      if (!password) return jsonResponse({ error: "Fuer neue Fahrer ist ein Passwort erforderlich." }, 400);
      const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createError) return jsonResponse({ error: `Auth-User konnte nicht erstellt werden: ${formatSupabaseError(createError)}` }, 400);
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
    if (profileError) return jsonResponse({ error: `Profil konnte nicht gespeichert werden: ${formatSupabaseError(profileError)}` }, 400);
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
  if (personnelError) return jsonResponse({ error: `Personalstamm konnte nicht gespeichert werden: ${formatSupabaseError(personnelError)}` }, 400);

  return jsonResponse({ personnelResourceId, profileId: profileId || null });
});
