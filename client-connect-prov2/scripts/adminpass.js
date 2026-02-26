#!/usr/bin/env node
/**
 * Admin Setup Script
 * 
 * Usage: node scripts/adminpass.js
 * 
 * Environment variables required:
 *   SUPABASE_URL          - Your Supabase project URL
 *   SUPABASE_SERVICE_KEY  - Your Supabase service role key
 * 
 * Example:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... node scripts/adminpass.js
 */

const readline = require("readline");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing environment variables.");
  console.error("   Set SUPABASE_URL and SUPABASE_SERVICE_KEY before running.");
  console.error("   Example: SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... node scripts/adminpass.js");
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

async function supabaseRequest(path, method = "GET", body = null) {
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

async function main() {
  console.log("\n🔐 Admin Setup - GestãoPro\n");

  const email = await ask("E-mail do admin: ");
  const password = await ask("Senha do admin (min 6 caracteres): ");

  if (!email || password.length < 6) {
    console.error("❌ E-mail inválido ou senha muito curta (mínimo 6 caracteres).");
    rl.close();
    process.exit(1);
  }

  console.log("\n⏳ Processando...\n");

  // 1. Check if an admin already exists in user_roles
  const { data: existingAdmins } = await supabaseRequest(
    `/rest/v1/user_roles?role=eq.admin&select=user_id`,
    "GET"
  );

  // 2. If admin exists, delete the old admin auth user + profile + role
  if (Array.isArray(existingAdmins) && existingAdmins.length > 0) {
    console.log("⚠️  Admin existente encontrado. Substituindo...\n");
    for (const admin of existingAdmins) {
      // Delete auth user (cascades to profiles via FK, and we manually delete role)
      await supabaseRequest(`/auth/v1/admin/users/${admin.user_id}`, "DELETE");
      await supabaseRequest(
        `/rest/v1/user_roles?user_id=eq.${admin.user_id}`,
        "DELETE"
      );
    }
  }

  // 3. Create new auth user
  const { status, data: newUser } = await supabaseRequest("/auth/v1/admin/users", "POST", {
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Administrador" },
  });

  if (status !== 200 && status !== 201) {
    console.error("❌ Erro ao criar usuário:", JSON.stringify(newUser));
    rl.close();
    process.exit(1);
  }

  const userId = newUser.id;
  console.log(`✅ Usuário criado: ${userId}`);

  // 4. Wait a moment for trigger to create profile + user role
  await new Promise((r) => setTimeout(r, 2000));

  // 5. Ensure admin role exists (trigger creates 'user' role, we change to 'admin')
  // First delete the 'user' role if created by trigger
  await supabaseRequest(`/rest/v1/user_roles?user_id=eq.${userId}&role=eq.user`, "DELETE");
  
  // Insert admin role
  const { status: roleStatus } = await supabaseRequest("/rest/v1/user_roles", "POST", {
    user_id: userId,
    role: "admin",
  });

  if (roleStatus === 201 || roleStatus === 200) {
    console.log("✅ Role 'admin' atribuída com sucesso!");
  } else {
    console.error("⚠️  Possível erro ao atribuir role admin. Verifique manualmente.");
  }

  // 6. Update profile to never expire
  await supabaseRequest(
    `/rest/v1/profiles?user_id=eq.${userId}`,
    "PATCH",
    { subscription_end: "2099-12-31T23:59:59Z", is_active: true }
  );

  console.log("\n🎉 Admin configurado com sucesso!");
  console.log(`   E-mail: ${email}`);
  console.log(`   Acesse: /admin\n`);

  rl.close();
}

main().catch((e) => {
  console.error("❌ Erro:", e.message);
  rl.close();
  process.exit(1);
});
