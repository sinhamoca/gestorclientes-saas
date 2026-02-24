import { supabase } from "@/integrations/supabase/client";

export async function encryptValues(values: string[]): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke("crypto-utils", {
    body: { action: "encrypt", values },
  });
  if (error) throw new Error("Encryption failed: " + error.message);
  return data.results;
}

export async function decryptValues(values: string[]): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke("crypto-utils", {
    body: { action: "decrypt", values },
  });
  if (error) throw new Error("Decryption failed: " + error.message);
  return data.results;
}

export async function decryptSingle(value: string | null): Promise<string | null> {
  if (!value) return value;
  const results = await decryptValues([value]);
  return results[0];
}

export async function encryptSingle(value: string | null): Promise<string | null> {
  if (!value) return value;
  const results = await encryptValues([value]);
  return results[0];
}
