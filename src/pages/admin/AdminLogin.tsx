import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield } from "lucide-react";

const techBadges = [
  { name: "React", color: "#61DAFB", bg: "rgba(97,218,251,0.1)" },
  { name: "TypeScript", color: "#3178C6", bg: "rgba(49,120,198,0.1)" },
  { name: "PostgreSQL", color: "#4169E1", bg: "rgba(65,105,225,0.1)" },
  { name: "Tailwind", color: "#06B6D4", bg: "rgba(6,182,212,0.1)" },
];

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (data) {
          navigate("/admin/users", { replace: true });
          return;
        }
      }
      setChecking(false);
    };
    check();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleData) {
        await supabase.auth.signOut();
        throw new Error("Acesso negado. Você não é administrador.");
      }

      navigate("/admin/users", { replace: true });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="p-2 rounded-xl bg-primary/10">
              <Shield className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Painel Administrativo</h1>
          <p className="text-muted-foreground mt-1">Acesso restrito a administradores</p>
        </div>

        <div className="glass-card rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
          </form>
        </div>
      </div>

      {/* Tech Badges */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mr-1">Powered by</span>
        {techBadges.map((tech) => (
          <span
            key={tech.name}
            className="px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors"
            style={{
              color: tech.color,
              backgroundColor: tech.bg,
              borderColor: `${tech.color}30`,
            }}
          >
            {tech.name}
          </span>
        ))}
        <span className="text-[10px] text-muted-foreground/50 ml-1">with ❤️</span>
      </div>
    </div>
  );
}