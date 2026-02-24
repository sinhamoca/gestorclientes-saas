import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export function useSuperAdmin() {
  const [user, setUser] = useState<User | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSuperAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setLoading(false);
        return;
      }
      setUser(session.user);

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "super_admin")
        .maybeSingle();

      setIsSuperAdmin(!!data);
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkSuperAdmin();
    });

    checkSuperAdmin();
    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, isSuperAdmin, loading, signOut };
}
