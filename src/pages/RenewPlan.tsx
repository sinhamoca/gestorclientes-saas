import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Crown, CheckCircle2, CreditCard } from "lucide-react";

interface PlatformPlan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_days: number;
  max_clients: number;
}

const RenewPlan = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [{ data: plansData }, { data: profile }] = await Promise.all([
        supabase.from("platform_plans").select("*").eq("is_active", true).order("price"),
        supabase.from("profiles").select("subscription_end").eq("user_id", user.id).single(),
      ]);
      setPlans((plansData as PlatformPlan[]) || []);
      setSubscriptionEnd(profile?.subscription_end || null);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const isExpired = subscriptionEnd ? new Date(subscriptionEnd) < new Date() : false;
  const daysLeft = subscriptionEnd
    ? Math.ceil((new Date(subscriptionEnd).getTime() - Date.now()) / 86400000)
    : 0;

  const handleRenew = async (plan: PlatformPlan) => {
    if (!user) return;
    setProcessingId(plan.id);
    try {
      const { data, error } = await supabase.functions.invoke("create-platform-payment", {
        body: { plan_id: plan.id },
      });

      if (error) throw new Error(error.message);

      if (data?.init_point) {
        window.open(data.init_point, "_blank");
      } else if (data?.qr_code_base64) {
        // PIX payment - show toast with instructions
        toast({ title: "PIX gerado!", description: "Escaneie o QR code para pagar. Seu plano será renovado automaticamente." });
      } else {
        toast({ title: "Erro", description: "Não foi possível gerar o pagamento", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setProcessingId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Renovar Plano</h1>
        <p className="text-muted-foreground">Escolha um plano para continuar usando a plataforma</p>
      </div>

      {/* Current status */}
      <div className="glass-card rounded-xl p-6 max-w-xl">
        <div className="flex items-center gap-3 mb-2">
          <Crown className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Sua Assinatura</h2>
        </div>
        {subscriptionEnd ? (
          <div className="flex items-center gap-3">
            <Badge variant={isExpired ? "destructive" : daysLeft <= 7 ? "outline" : "default"}>
              {isExpired ? "Expirado" : `${daysLeft} dias restantes`}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {isExpired ? "Expirou em" : "Expira em"}{" "}
              {new Date(subscriptionEnd).toLocaleDateString("pt-BR")}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sem assinatura ativa</p>
        )}
      </div>

      {/* Plans */}
      {plans.length === 0 ? (
        <div className="glass-card rounded-xl p-6 text-center text-muted-foreground">
          Nenhum plano disponível no momento. Entre em contato com o administrador.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map(plan => (
            <div key={plan.id} className="glass-card rounded-xl p-6 flex flex-col justify-between hover:border-primary/30 transition-colors">
              <div>
                <h3 className="text-lg font-bold mb-1">{plan.name}</h3>
                {plan.description && (
                  <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                )}
                <div className="space-y-2 mb-6">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span>{plan.duration_days} dias de acesso</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span>Até {plan.max_clients} clientes</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-3xl font-bold mb-4">
                  R$ {Number(plan.price).toFixed(2)}
                </p>
                <Button
                  className="w-full"
                  onClick={() => handleRenew(plan)}
                  disabled={processingId === plan.id}
                >
                  {processingId === plan.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="mr-2 h-4 w-4" />
                  )}
                  Assinar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RenewPlan;
