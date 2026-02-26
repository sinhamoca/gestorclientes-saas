import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---- Encryption helpers ----
const ALGORITHM = "AES-GCM";

async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("ENCRYPTION_KEY")!;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", hash, { name: ALGORITHM }, false, ["decrypt"]);
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

async function decryptValue(encrypted: string, key: CryptoKey): Promise<string> {
  if (!encrypted.startsWith("enc:")) return encrypted;
  const parts = encrypted.split(":");
  if (parts.length !== 3) return encrypted;
  const iv = fromHex(parts[1]);
  const ciphertext = fromHex(parts[2]);
  const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

// Helper: get admin_id for a user
async function getAdminId(supabase: any, userId: string): Promise<string | null> {
  const { data: role } = await supabase
    .from("user_roles").select("role").eq("user_id", userId)
    .in("role", ["admin", "super_admin"]).maybeSingle();
  if (role) return userId;
  const { data: profile } = await supabase
    .from("profiles").select("created_by").eq("user_id", userId).single();
  return profile?.created_by || null;
}
// ---- End helpers ----

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const encKey = await getKey();

    // Current time in Brasilia (UTC-3)
    const now = new Date();
    const brasiliaOffset = -3 * 60;
    const brasilia = new Date(now.getTime() + (brasiliaOffset + now.getTimezoneOffset()) * 60000);

    const todayStr = `${brasilia.getFullYear()}-${String(brasilia.getMonth() + 1).padStart(2, "0")}-${String(brasilia.getDate()).padStart(2, "0")}`;
    const currentTime = `${String(brasilia.getHours()).padStart(2, "0")}:${String(brasilia.getMinutes()).padStart(2, "0")}`;
    const currentHour = brasilia.getHours();
    const currentMinute = brasilia.getMinutes();

    console.log(`[send-reminders] Running at ${todayStr} ${currentTime} (Brasilia)`);

    // Check if this is a manual send (triggered from UI)
    let manualReminderId: string | null = null;
    try {
      const body = await req.json();
      manualReminderId = body?.reminder_id || null;
    } catch { /* no body = automatic cron call */ }

    const isManual = !!manualReminderId;
    if (isManual) {
      console.log(`[send-reminders] Manual send requested for reminder ${manualReminderId}`);
    }

    // Fetch reminders
    let remQuery = supabase
      .from("reminders")
      .select("*, message_templates(*)");

    if (isManual) {
      remQuery = remQuery.eq("id", manualReminderId);
    } else {
      remQuery = remQuery.eq("is_active", true);
    }

    const { data: reminders, error: remErr } = await remQuery;

    if (remErr) throw remErr;
    if (!reminders || reminders.length === 0) {
      return new Response(JSON.stringify({ 
        message: isManual ? "Lembrete não encontrado" : "No active reminders",
        sent: 0,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSent = 0;

    for (const reminder of reminders) {
      // For automatic sends: check if already sent today and time window
      if (!isManual) {
        if (reminder.last_sent_date === todayStr) {
          continue;
        }

        const [sendHour, sendMinute] = (reminder.send_time || "09:00").split(":").map(Number);
        if (currentHour !== sendHour) continue;
        if (currentMinute < sendMinute || currentMinute > sendMinute + 5) continue;
      }

      const templateContent = reminder.message_templates?.content;
      if (!templateContent) {
        console.log(`[send-reminders] Reminder "${reminder.name}" has no template, skipping`);
        continue;
      }

      // Calculate target due_date
      const targetDate = new Date(brasilia);
      targetDate.setDate(targetDate.getDate() - reminder.days_offset);
      const targetDueDate = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;

      // Get user profile for WuzAPI credentials and PIX key
      const { data: profile } = await supabase
        .from("profiles")
        .select("wuzapi_url, wuzapi_token, pix_key, messages_per_minute")
        .eq("user_id", reminder.user_id)
        .single();

      if (!profile?.wuzapi_url || !profile?.wuzapi_token) {
        console.log(`[send-reminders] User ${reminder.user_id} has no WuzAPI config, skipping`);
        continue;
      }

      // Check if WhatsApp is connected
      try {
        const statusRes = await fetch(`${profile.wuzapi_url.replace(/\/+$/, "")}/session/status`, {
          method: "GET",
          headers: { "Content-Type": "application/json", "Token": profile.wuzapi_token },
        });
        const statusData = await statusRes.json();
        if (!statusData?.data?.Connected && !statusData?.data?.connected) {
          console.log(`[send-reminders] WhatsApp not connected for user ${reminder.user_id}, skipping`);
          continue;
        }
      } catch {
        console.log(`[send-reminders] Failed to check WhatsApp status for user ${reminder.user_id}, skipping`);
        continue;
      }

      // Find clients with matching due_date
      const { data: clients } = await supabase
        .from("clients")
        .select("*, plans(name)")
        .eq("user_id", reminder.user_id)
        .eq("is_active", true)
        .eq("due_date", targetDueDate)
        .not("whatsapp_number", "is", null);

      if (!clients || clients.length === 0) {
        console.log(`[send-reminders] No clients with due_date ${targetDueDate} for reminder "${reminder.name}"`);
        await supabase.from("reminders").update({ last_sent_date: todayStr }).eq("id", reminder.id);
        continue;
      }

      const delayMs = Math.ceil(60000 / (profile.messages_per_minute || 5));

      // Get app URL from admin's settings (NOT global)
      const adminId = await getAdminId(supabase, reminder.user_id);
      let appUrl = "";
      if (adminId) {
        const { data: appUrlSetting } = await supabase
          .from("system_settings")
          .select("value")
          .eq("user_id", adminId)
          .eq("key", "app_url")
          .single();
        appUrl = (appUrlSetting?.value || "").replace(/\/+$/, "");
      }

      for (let i = 0; i < clients.length; i++) {
        const client = clients[i];

        // Decrypt WhatsApp number
        let whatsappNumber = client.whatsapp_number;
        try {
          whatsappNumber = await decryptValue(whatsappNumber, encKey);
        } catch (e) {
          console.error(`[send-reminders] Failed to decrypt number for client ${client.id}:`, e.message);
        }

        // Build {link_pagamento}
        let linkPagamento = "";
        if (client.payment_type === "pix" && profile.pix_key) {
          linkPagamento = profile.pix_key;
        } else if (client.payment_token && appUrl) {
          linkPagamento = `${appUrl}/pay/${client.payment_token}`;
        }

        // Replace template variables
        const dueFormatted = client.due_date
          ? (() => { const [y, m, d] = client.due_date.split("-"); return `${d}/${m}/${y}`; })()
          : "";

        let message = templateContent
          .replace(/\{nome\}/g, client.name || "")
          .replace(/\{vencimento\}/g, dueFormatted)
          .replace(/\{valor\}/g, `R$ ${Number(client.price_value || 0).toFixed(2)}`)
          .replace(/\{plano\}/g, client.plans?.name || "")
          .replace(/\{whatsapp\}/g, whatsappNumber || "")
          .replace(/\{link_pagamento\}/g, linkPagamento)
          .replace(/\{saudacao\}/g, (() => {
            const h = brasilia.getHours();
            if (h < 12) return "Bom dia";
            if (h < 18) return "Boa tarde";
            return "Boa noite";
          })())
          .replace(/\{dias\}/g, (() => {
            if (!client.due_date) return "";
            const [y, m, d] = client.due_date.split("-").map(Number);
            const due = new Date(y, m - 1, d);
            const today = new Date(brasilia.getFullYear(), brasilia.getMonth(), brasilia.getDate());
            return String(Math.ceil((due.getTime() - today.getTime()) / 86400000));
          })());

        const phone = whatsappNumber.replace(/\D/g, "");

        try {
          await fetch(`${profile.wuzapi_url.replace(/\/+$/, "")}/chat/send/text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Token": profile.wuzapi_token },
            body: JSON.stringify({ Phone: phone, Body: message }),
          });
          totalSent++;
          console.log(`[send-reminders] Sent to ${phone} for reminder "${reminder.name}"`);
        } catch (e) {
          console.error(`[send-reminders] Failed to send to ${phone}:`, e.message);
        }

        if (i < clients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      // Mark reminder as sent today
      await supabase.from("reminders").update({ last_sent_date: todayStr }).eq("id", reminder.id);
      console.log(`[send-reminders] Reminder "${reminder.name}" marked as sent for ${todayStr}`);
    }

    return new Response(JSON.stringify({
      message: isManual
        ? `Envio manual: ${totalSent} mensagens enviadas`
        : `Processed ${reminders.length} reminders, sent ${totalSent} messages`,
      time: currentTime,
      date: todayStr,
      manual: isManual,
      sent: totalSent,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[send-reminders] Fatal error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
