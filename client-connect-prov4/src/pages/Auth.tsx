import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Zap, ShieldCheck, ArrowLeft } from "lucide-react";

const techBadges = [
  { name: "React", color: "#61DAFB", bg: "rgba(97,218,251,0.1)" },
  { name: "TypeScript", color: "#3178C6", bg: "rgba(49,120,198,0.1)" },
  { name: "PostgreSQL", color: "#4169E1", bg: "rgba(65,105,225,0.1)" },
  { name: "Tailwind", color: "#06B6D4", bg: "rgba(6,182,212,0.1)" },
];

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [verifying2FA, setVerifying2FA] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Check if user has 2FA enabled
      const { data: checkData, error: checkErr } = await supabase.functions.invoke("totp-manage", {
        body: { action: "check", user_id: data.user.id },
      });

      if (checkErr) {
        // If function doesn't exist or errors, skip 2FA check
        console.warn("2FA check failed, proceeding without:", checkErr.message);
        navigate("/dashboard");
        return;
      }

      if (checkData?.enabled) {
        // Need 2FA verification — stay on page
        setNeeds2FA(true);
        setLoading(false);
        return;
      }

      // No 2FA, proceed normally
      navigate("/dashboard");
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length !== 6) {
      toast({ title: "Erro", description: "Digite os 6 dígitos do autenticador", variant: "destructive" });
      return;
    }

    setVerifying2FA(true);
    try {
      const { data, error } = await supabase.functions.invoke("totp-manage", {
        body: { action: "verify", code: totpCode },
      });

      if (error) throw new Error(error.message);

      if (data?.valid) {
        navigate("/dashboard");
      } else {
        toast({ title: "Código inválido", description: "Verifique o código no seu autenticador e tente novamente", variant: "destructive" });
        setTotpCode("");
      }
    } catch (error: any) {
      await supabase.auth.signOut();
      toast({ title: "Erro na verificação", description: error.message, variant: "destructive" });
      setNeeds2FA(false);
      setTotpCode("");
    } finally {
      setVerifying2FA(false);
    }
  };

  const handleBack = async () => {
    await supabase.auth.signOut();
    setNeeds2FA(false);
    setTotpCode("");
    setPassword("");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="p-2 rounded-xl bg-primary/10 glow-primary">
              {needs2FA ? <ShieldCheck className="h-8 w-8 text-primary" /> : <Zap className="h-8 w-8 text-primary" />}
            </div>
          </div>
          <h1 className="text-3xl font-bold gradient-text">
            {needs2FA ? "Verificação 2FA" : "Super Gestor Pro"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {needs2FA ? "Digite o código do Google Authenticator" : "Acesse sua conta"}
          </p>
        </div>

        <div className="glass-card rounded-2xl p-8">
          {!needs2FA ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Entrar
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerify2FA} className="space-y-5">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Abra o <strong>Google Authenticator</strong> e digite o código de 6 dígitos
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="totp-code">Código do Autenticador</Label>
                <Input
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  required
                  autoFocus
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                />
              </div>

              <Button type="submit" className="w-full" disabled={verifying2FA || totpCode.length !== 6}>
                {verifying2FA && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verificar
              </Button>

              <Button type="button" variant="ghost" className="w-full" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar ao login
              </Button>
            </form>
          )}
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
};

export default Auth;