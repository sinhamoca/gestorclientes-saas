import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { endpoint, method, body } = await req.json();

    // Get user's WuzAPI credentials from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("wuzapi_url, wuzapi_token")
      .eq("user_id", user.id)
      .single();

    if (!profile?.wuzapi_url || !profile?.wuzapi_token) {
      return new Response(JSON.stringify({ error: "WuzAPI not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `${profile.wuzapi_url.replace(/\/+$/, "")}${endpoint}`;

    const response = await fetch(url, {
      method: method || "POST",
      headers: {
        "Content-Type": "application/json",
        "Token": profile.wuzapi_token,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.text();

    // Always return 200 so supabase.functions.invoke doesn't treat WuzAPI errors as failures
    return new Response(JSON.stringify({ wuzapi_status: response.status, wuzapi_response: data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
