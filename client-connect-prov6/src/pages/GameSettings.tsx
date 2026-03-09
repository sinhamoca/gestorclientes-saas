import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Gamepad2, Loader2, Trophy, Info, BarChart2 } from "lucide-react";

interface GameSettings {
  is_enabled: boolean;
  free_games_per_month: number;
  wins_required: number;
  discount_percent: number | null;
  difficulty: "easy" | "medium" | "hard" | "pro";
  token_price: number | null;
}

interface Stats {
  totalSessions: number;
  totalWins: number;
  totalLosses: number;
  totalPrizes: number;
}

const defaultSettings: GameSettings = {
  is_enabled: false,
  free_games_per_month: 1,
  wins_required: 3,
  discount_percent: null,
  difficulty: "medium",
  token_price: null,
};

const difficultyInfo: Record<string, { label: string; description: string; color: string }> = {
  easy:   { label: "Fácil",         description: "IA comete erros frequentes. Maioria dos clientes vence.",    color: "text-green-500" },
  medium: { label: "Médio",         description: "IA joga bem mas é vencível com atenção.",                    color: "text-yellow-500" },
  hard:   { label: "Difícil",       description: "IA raramente erra. Exige estratégia para vencer.",           color: "text-orange-500" },
  pro:    { label: "Profissional",  description: "IA quase imbatível. Apenas os melhores jogadores vencem.",   color: "text-red-500" },
};

export default function GameSettings() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [settings, setSettings] = useState<GameSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  const set = (key: keyof GameSettings, value: any) =>
    setSettings(s => ({ ...s, [key]: value }));

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);

      // Configurações
      const { data } = await supabase
        .from("game_settings")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (data) {
        setSettings({
          is_enabled: data.is_enabled,
          free_games_per_month: data.free_games_per_month,
          wins_required: data.wins_required,
          discount_percent: data.discount_percent ?? null,
          difficulty: data.difficulty,
          token_price: data.token_price ?? null,
        });
      }

      // Estatísticas do mês atual
      const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      const [sessionsRes, prizesRes] = await Promise.all([
        supabase
          .from("game_sessions")
          .select("result")
          .eq("user_id", user.id)
          .gte("started_at", firstDay),
        supabase
          .from("game_prizes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("granted_at", firstDay),
      ]);

      const sessions = sessionsRes.data || [];
      setStats({
        totalSessions: sessions.filter(s => s.result !== "playing").length,
        totalWins:     sessions.filter(s => s.result === "won").length,
        totalLosses:   sessions.filter(s => s.result === "lost").length,
        totalPrizes:   prizesRes.count || 0,
      });

      setLoading(false);
    };
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const payload = {
      user_id: user.id,
      is_enabled: settings.is_enabled,
      free_games_per_month: settings.free_games_per_month,
      wins_required: settings.wins_required,
      discount_percent: settings.discount_percent || null,
      difficulty: settings.difficulty,
      token_price: settings.token_price || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("game_settings")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configurações salvas!" });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const diff = difficultyInfo[settings.difficulty];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Gamepad2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Mini Game — Damas</h1>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Partidas este mês", value: stats.totalSessions, icon: "🎮" },
            { label: "Vitórias",          value: stats.totalWins,     icon: "🏆" },
            { label: "Derrotas",          value: stats.totalLosses,   icon: "😔" },
            { label: "Prêmios concedidos",value: stats.totalPrizes,   icon: "🎁" },
          ].map(s => (
            <Card key={s.label} className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-lg">{s.icon}</span>
                <span className="text-2xl font-bold text-foreground">{s.value}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Configurações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Configurações do Jogo</span>
            <div className="flex items-center gap-2">
              <Switch
                checked={settings.is_enabled}
                onCheckedChange={v => set("is_enabled", v)}
              />
              <span className="text-sm font-normal text-muted-foreground">
                {settings.is_enabled ? "Ativo" : "Inativo"}
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Dificuldade */}
          <div className="space-y-2">
            <Label>Dificuldade da IA</Label>
            <Select value={settings.difficulty} onValueChange={v => set("difficulty", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(difficultyInfo).map(([key, d]) => (
                  <SelectItem key={key} value={key}>
                    <span className={d.color}>{d.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border/30">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">{diff.description}</p>
            </div>
          </div>

          <Separator />

          {/* Jogadas gratuitas */}
          <div className="space-y-2">
            <Label>Partidas gratuitas por mês</Label>
            <Input
              type="number"
              min="0"
              value={settings.free_games_per_month}
              onChange={e => set("free_games_per_month", Math.max(0, parseInt(e.target.value) || 0))}
              className="max-w-[160px]"
            />
            <p className="text-xs text-muted-foreground">
              {settings.free_games_per_month === 0
                ? "✨ Ilimitado — clientes jogam quantas vezes quiserem."
                : `Cada cliente pode jogar ${settings.free_games_per_month} partida(s) gratuitamente por mês.`}
            </p>
          </div>

          <Separator />

          {/* Prêmio */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <Label className="text-base">Configuração do Prêmio</Label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vitórias necessárias</Label>
                <Input
                  type="number"
                  min="1"
                  value={settings.wins_required}
                  onChange={e => set("wins_required", Math.max(1, parseInt(e.target.value) || 1))}
                />
                <p className="text-xs text-muted-foreground">
                  Partidas vencidas no mês para ganhar o prêmio.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Desconto do prêmio (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="0 = sem prêmio"
                  value={settings.discount_percent ?? ""}
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    set("discount_percent", isNaN(v) || v <= 0 ? null : Math.min(100, v));
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {settings.discount_percent
                    ? `Ganhador recebe ${settings.discount_percent}% de desconto.`
                    : "Sem prêmio — o jogo é por diversão."}
                </p>
              </div>
            </div>

            {/* Preview da regra */}
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground text-xs uppercase tracking-wide">Regra atual:</p>
              <p>
                {settings.free_games_per_month === 0 ? "Partidas ilimitadas" : `${settings.free_games_per_month} partida(s) grátis/mês`}
                {" "}·{" "}
                {`Vencer ${settings.wins_required}x para `}
                {settings.discount_percent
                  ? <span className="text-primary font-semibold">ganhar {settings.discount_percent}% de desconto</span>
                  : <span>completar o desafio (sem prêmio)</span>
                }
              </p>
            </div>
          </div>

          <Separator />

          {/* Fichas pagas */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-base">🎟️</span>
              <Label className="text-base">Fichas Pagas</Label>
            </div>

            <div className="space-y-2">
              <Label>Valor por ficha extra (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0 = desabilitado"
                value={settings.token_price ?? ""}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  set("token_price", isNaN(v) || v <= 0 ? null : v);
                }}
                className="max-w-[200px]"
              />
              <p className="text-xs text-muted-foreground">
                {settings.token_price
                  ? `Clientes pagam R$ ${settings.token_price.toFixed(2)} por ficha extra via PIX.`
                  : "Fichas pagas desabilitadas — apenas partidas gratuitas disponíveis."}
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Configurações
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
