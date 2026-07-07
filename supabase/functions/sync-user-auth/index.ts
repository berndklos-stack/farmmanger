import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRoles = new Set([
  "farmer_admin",
  "farmer_employee",
  "contractor_admin",
  "driver",
  "advisor",
  "support_admin",
]);

const allowedModules = new Set(["contractor", "farmer", "driver"]);
const allowedViews = new Set(["dashboard", "fields", "jobs", "driver", "contractor", "masterData", "rights", "report"]);

type UserAuthRequest = {
  fullName?: string;
  email?: string;
  password?: string;
  role?: string;
  organizationId?: string | null;
  allowedModules?: string[];
  allowedViews?: string[];
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

function cleanList(value: unknown, allowedValues: Set<string>) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && allowedValues.has(item));
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

async function findAuthUserIdByEmail(admin: ReturnType<typeof createClient>, email: string) {
  const normalizedEmail = email.toLowerCase();
  try {
    for (let page = 1; page <= 50; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return { error: `Auth-User konnte nicht gesucht werden: ${formatSupabaseError(error)}` };
      const user = data.users.find((item) => item.email?.toLowerCase() === normalizedEmail);
      if (user) return { userId: user.id };
      if (data.users.length < 200) break;
    }
  } catch (error) {
    return { error: `Auth-User konnte nicht gesucht werden: ${formatSupabaseError(error)}` };
  }
  return {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt." }, 500);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return jsonResponse({ error: "Anmeldung fehlt." }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: requester, error: requesterError } = await admin.auth.getUser(token);
  if (requesterError || !requester.user) {
    return jsonResponse({ error: "Anmeldung konnte nicht geprüft werden." }, 401);
  }

  const { data: requesterProfile, error: requesterProfileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", requester.user.id)
    .maybeSingle();
  if (requesterProfileError) {
    return jsonResponse({ error: `Support-Rechte konnten nicht geprüft werden: ${formatSupabaseError(requesterProfileError)}` }, 400);
  }
  if (requesterProfile?.role !== "support_admin") {
    return jsonResponse({ error: "Nur Support Admins dürfen Benutzer anlegen." }, 403);
  }

  const body = (await req.json()) as UserAuthRequest;
  const fullName = cleanText(body.fullName);
  const email = cleanText(body.email).toLowerCase();
  const password = cleanText(body.password);
  const role = cleanText(body.role);
  const organizationId = role === "support_admin" || role === "driver" ? null : cleanText(body.organizationId) || null;
  const modules = cleanList(body.allowedModules, allowedModules);
  const views = cleanList(body.allowedViews, allowedViews);

  if (!fullName || !email || !password) return jsonResponse({ error: "Name, E-Mail und Passwort sind erforderlich." }, 400);
  if (password.length < 6) return jsonResponse({ error: "Das Passwort muss mindestens 6 Zeichen haben." }, 400);
  if (!allowedRoles.has(role)) return jsonResponse({ error: "Diese Rolle ist nicht erlaubt." }, 400);
  if (modules.length === 0 || views.length === 0) return jsonResponse({ error: "Mindestens ein Modul und ein Menüpunkt müssen freigegeben sein." }, 400);

  let profileId = "";
  const { data: existingProfiles, error: profileLookupError } = await admin
    .from("profiles")
    .select("id, email")
    .eq("email", email)
    .limit(1);
  if (profileLookupError) {
    return jsonResponse({ error: `Profil konnte nicht geprüft werden: ${formatSupabaseError(profileLookupError)}` }, 400);
  }
  if (existingProfiles && existingProfiles.length > 0) {
    return jsonResponse({ error: "Diese E-Mail ist bereits als Profil angelegt." }, 400);
  }

  const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError) {
    const formattedCreateError = formatSupabaseError(createError);
    if (formattedCreateError.toLowerCase().includes("email_exists") || formattedCreateError.toLowerCase().includes("already been registered")) {
      const existingAuthUser = await findAuthUserIdByEmail(admin, email);
      if (existingAuthUser.error) return jsonResponse({ error: existingAuthUser.error }, 400);
      if (!existingAuthUser.userId) return jsonResponse({ error: `Auth-User existiert bereits, konnte aber nicht geladen werden: ${formattedCreateError}` }, 400);
      profileId = existingAuthUser.userId;
      const { error: updateError } = await admin.auth.admin.updateUserById(profileId, {
        password,
        user_metadata: { full_name: fullName },
      });
      if (updateError) return jsonResponse({ error: `Auth-User konnte nicht aktualisiert werden: ${formatSupabaseError(updateError)}` }, 400);
    } else {
      return jsonResponse({ error: `Auth-User konnte nicht erstellt werden: ${formattedCreateError}` }, 400);
    }
  } else {
    profileId = createdUser.user.id;
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: profileId,
    full_name: fullName,
    email,
    role,
    organization_id: organizationId,
    allowed_modules: modules,
    allowed_views: views,
  });
  if (profileError) {
    return jsonResponse({ error: `Profil konnte nicht gespeichert werden: ${formatSupabaseError(profileError)}` }, 400);
  }

  return jsonResponse({ profileId });
});
