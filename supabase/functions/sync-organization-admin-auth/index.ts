import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type OrganizationAdminAuthRequest = {
  organizationId?: string;
  fullName?: string;
  email?: string;
  password?: string;
  role?: "farmer_admin" | "contractor_admin";
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
    const values = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown; status?: unknown };
    const parts = [values.message, values.details, values.hint, values.code, values.status]
      .filter((value) => typeof value === "string" && value && value !== "{}");
    if (parts.length > 0) return parts.join(" · ");
    return JSON.stringify(error);
  }
  return String(error);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt." }, 500);
  }

  const body = (await req.json()) as OrganizationAdminAuthRequest;
  const organizationId = cleanText(body.organizationId);
  const fullName = cleanText(body.fullName);
  const email = cleanText(body.email).toLowerCase();
  const password = cleanText(body.password);
  const role = body.role === "farmer_admin" ? "farmer_admin" : "contractor_admin";

  if (!organizationId || !fullName || !email) {
    return jsonResponse({ error: "organizationId, fullName und email sind erforderlich." }, 400);
  }
  if (!password || password.length < 6) {
    return jsonResponse({ error: "Fuer neue Logins ist ein Passwort mit mindestens 6 Zeichen erforderlich." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existingProfiles, error: profileLookupError } = await admin
    .from("profiles")
    .select("id, role, organization_id")
    .eq("email", email)
    .limit(10);
  if (profileLookupError) {
    return jsonResponse({ error: `Profil konnte nicht gelesen werden: ${formatSupabaseError(profileLookupError)}` }, 400);
  }

  let profileId = cleanText(existingProfiles?.find((profile) => (
    profile.organization_id === organizationId && ["farmer_admin", "contractor_admin"].includes(profile.role)
  ))?.id);
  const conflictingProfile = existingProfiles?.find((profile) => (
    profile.id !== profileId
    && profile.organization_id !== organizationId
    && profile.role !== role
  ));
  if (conflictingProfile) {
    return jsonResponse({ error: "Diese E-Mail wird bereits fuer einen anderen Betrieb oder eine andere Rolle verwendet." }, 400);
  }

  if (profileId) {
    const { error } = await admin.auth.admin.updateUserById(profileId, {
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error && error.status !== 404) {
      return jsonResponse({ error: `Auth-User konnte nicht aktualisiert werden: ${formatSupabaseError(error)}` }, 400);
    }
    if (error?.status === 404) profileId = "";
  }

  if (!profileId) {
    const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createError) {
      const formattedError = formatSupabaseError(createError);
      if (formattedError.toLowerCase().includes("already") || formattedError.toLowerCase().includes("exists") || formattedError.toLowerCase().includes("registered")) {
        return jsonResponse({ error: "Diese E-Mail existiert bereits als Supabase-Login. Bitte den bestehenden Benutzer pruefen oder eine andere E-Mail verwenden." }, 400);
      }
      return jsonResponse({ error: `Auth-User konnte nicht erstellt werden: ${formattedError}` }, 400);
    }
    profileId = createdUser.user.id;
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: profileId,
    full_name: fullName,
    email,
    role,
    organization_id: organizationId,
    vehicle_name: null,
    job_visibility: "organization_all",
  });
  if (profileError) {
    return jsonResponse({ error: `Profil konnte nicht gespeichert werden: ${formatSupabaseError(profileError)}` }, 400);
  }

  return jsonResponse({ profileId, organizationId, role });
});
