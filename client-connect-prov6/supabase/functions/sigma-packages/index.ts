import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { credential_id } = await req.json();
    if (!credential_id) return new Response(JSON.stringify({ error: "credential_id required" }), { status: 400, headers: corsHeaders });

    const { data: cred } = await supabaseAdmin
      .from("panel_credentials")
      .select("*")
      .eq("id", credential_id)
      .eq("user_id", user.id)
      .single();

    if (!cred) return new Response(JSON.stringify({ error: "Credential not found" }), { status: 404, headers: corsHeaders });
    if (cred.provider !== "sigma") return new Response(JSON.stringify({ error: "Only sigma supports package discovery" }), { status: 400, headers: corsHeaders });

    // Get admin ID for this user
    const { data: role } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", user.id)
      .in("role", ["admin", "super_admin"]).maybeSingle();
    let adminId = user.id;
    if (!role) {
      const { data: profile } = await supabaseAdmin
        .from("profiles").select("created_by").eq("user_id", user.id).single();
      adminId = profile?.created_by || user.id;
    }

    // Fetch API settings from admin
    const { data: settings } = await supabaseAdmin
      .from("system_settings")
      .select("key, value")
      .eq("user_id", adminId)
      .in("key", ["renewal_api_url", "renewal_api_key"]);

    const apiUrl = settings?.find(s => s.key === "renewal_api_url")?.value;
    const apiKey = settings?.find(s => s.key === "renewal_api_key")?.value;

    if (!apiUrl || !apiKey) return new Response(JSON.stringify({ error: "Renewal API not configured" }), { status: 500, headers: corsHeaders });

    const domainUrl = cred.domain?.startsWith("http") ? cred.domain : `https://${cred.domain}`;

    const apiResponse = await fetch(`${apiUrl}/sigma/packages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({
        credentials: { username: cred.username, password: cred.password },
        sigma_domain: domainUrl,
      }),
    });

    const result = await apiResponse.json();

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
