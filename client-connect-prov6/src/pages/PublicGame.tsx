import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Gamepad2, Trophy, ChevronLeft, Copy, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import CheckersGame, { type Difficulty } from "@/components/CheckersGame";

// ─── Tipos ────────────────────────────────────────
interface GameInfo {
  isEnabled: boolean;
  difficulty: Difficulty;
  freeGames: number;
  winsRequired: number;
  discountPercent: number | null;
  tokenPrice: number | null;
  gamesUsedThisMonth: number;
  winsThisMonth: number;
  prizeGrantedThisMonth: boolean;
  tokenBalance: number;
}

interface SessionData {
  canPlay: boolean;
  reason?: string;
  sessionId?: string;
  difficulty: Difficulty;
  winsRequired: number;
  discountPercent: number | null;
  tokenPrice: number | null;
  tokenBalance: number;
  gamesUsed: number;
  freeGames: number;
  winsThisMonth: number;
  prizeAlreadyGranted: boolean;
}

interface TokenOrder {
  orderId: string;
  paymentId: string;
  amount: string;
  quantity: number;
  pix: {
    qr_code: string | null;
    qr_code_base64: string | null;
  };
}

interface FinishData {
  success: boolean;
  result: "won" | "lost";
  winsThisMonth: number;
  winsRequired: number;
  prizeGranted: boolean;
  discountPercent: number | null;
}

type Screen = "loading" | "info" | "playing" | "result" | "no_games" | "error";

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/game-session`;
const APIKEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function callFn(body: object) {
  return fetch(FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: APIKEY },
    body: JSON.stringify(body),
  }).then(r => r.json());
}

export default function PublicGame() {
  const { token } = useParams<{ token: string }>();

  const [screen,     setScreen]      = useState<Screen>("loading");
  const [gameInfo,   setGameInfo]    = useState<GameInfo | null>(null);
  const [session,    setSession]     = useState<SessionData | null>(null);
  const [finishData, setFinishData]  = useState<FinishData | null>(null);
  const [gameKey,    setGameKey]     = useState(0); // força remount do jogo
  const [starting,   setStarting]    = useState(false);

  // Compra de fichas
  const [tokenOrder,     setTokenOrder]     = useState<TokenOrder | null>(null);
  const [buyingTokens,   setBuyingTokens]   = useState(false);
  const [tokenCopied,    setTokenCopied]    = useState(false);
  const [pollingTokens,  setPollingTokens]  = useState(false);
  const pollingTokenRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Carrega info inicial
  useEffect(() => {
    if (!token) { setScreen("error"); return; }
    callFn({ token, action: "info" }).then(data => {
      if (data.isEnabled) {
        setGameInfo(data);
        setScreen("info");
      } else {
        setScreen("error");
      }
    }).catch(() => setScreen("error"));
  }, [token]);

  // ── Compra de fichas ───────────────────────────────────────
  const handleBuyToken = async () => {
    if (!token) return;
    setBuyingTokens(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-game-payment`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ token, quantity: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao gerar PIX");
      setTokenOrder(data);
      startPollingToken(data.orderId);
    } catch (e: any) {
      console.error("buy token error:", e.message);
    }
    setBuyingTokens(false);
  };

  const startPollingToken = (orderId: string) => {
    if (pollingTokenRef.current) clearInterval(pollingTokenRef.current);
    setPollingTokens(true);
    let attempts = 0;
    pollingTokenRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 72) { // 6 min
        clearInterval(pollingTokenRef.current!);
        setPollingTokens(false);
        return;
      }
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/game-session`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ token, action: "check_payment", order_id: orderId }),
        });
        const data = await res.json();
        if (data.credited) {
          clearInterval(pollingTokenRef.current!);
          setPollingTokens(false);
          setTokenOrder(null);
          // Recarrega info e vai direto jogar
          const infoRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/game-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
            body: JSON.stringify({ token, action: "info" }),
          });
          const infoData = await infoRes.json();
          if (infoData.isEnabled) setGameInfo(infoData);
          setScreen("info");
        }
      } catch { /* ignora */ }
    }, 5000);
  };

  const copyPixToken = () => {
    const code = tokenOrder?.pix?.qr_code;
    if (!code) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code);
    } else {
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 3000);
  };
  // ────────────────────────────────────────────────────────────

  const handleStart = async () => {
    if (!token) return;
    setStarting(true);
    const data: SessionData = await callFn({ token, action: "start" });
    setStarting(false);

    setSession(data); // salva sempre — tela no_games precisa de tokenPrice
    if (!data.canPlay) {
      setScreen("no_games");
      return;
    }
    setScreen("playing");
  };

  const handleNewGame = () => {
    // Volta para info para o jogador iniciar uma nova sessão
    setFinishData(null);
    setSession(null);
    setScreen("info");
    // Recarrega info (contadores atualizados)
    callFn({ token, action: "info" }).then(data => {
      if (data.isEnabled) setGameInfo(data);
    });
  };

  const handleGameEnd = async (result: "won" | "lost") => {
    if (!token || !session?.sessionId) return;
    const data: FinishData = await callFn({
      token,
      action: "finish",
      session_id: session.sessionId,
      result,
    });
    setFinishData(data);
    setScreen("result");
  };

  // ── Telas ────────────────────────────────────────

  if (screen === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (screen === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="glass-card rounded-2xl p-8 max-w-sm w-full text-center space-y-3">
          <Gamepad2 className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-bold text-foreground">Jogo indisponível</h1>
          <p className="text-muted-foreground text-sm">Este jogo não está ativo ou o link é inválido.</p>
          <Button variant="outline" onClick={() => window.history.back()}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  if (screen === "no_games") {
    const sessionNoGames = session;
    const hasTokenOption = sessionNoGames?.tokenPrice && sessionNoGames.tokenPrice > 0;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
        <div className="glass-card rounded-2xl p-6 max-w-sm w-full space-y-5">
          <div className="text-center space-y-2">
            <span className="text-4xl">🎮</span>
            <h1 className="text-xl font-bold text-foreground">Partidas gratuitas esgotadas</h1>
            <p className="text-muted-foreground text-sm">
              Você já usou todas as suas partidas gratuitas deste mês.
            </p>
          </div>

          {hasTokenOption ? (
            <>
              {/* Tela de compra de ficha */}
              {!tokenOrder ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center space-y-1">
                    <p className="text-sm text-muted-foreground">Compre uma ficha extra por</p>
                    <p className="text-3xl font-bold text-primary">
                      R$ {Number(sessionNoGames!.tokenPrice).toFixed(2)}
                    </p>
                  </div>
                  <Button className="w-full" size="lg" onClick={handleBuyToken} disabled={buyingTokens}>
                    {buyingTokens
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando PIX...</>
                      : <>🎟️ Comprar ficha via PIX</>
                    }
                  </Button>
                </div>
              ) : (
                /* QR Code PIX para ficha */
                <div className="space-y-4">
                  <div className="text-center p-3 rounded-xl bg-primary/10 border border-primary/20">
                    <p className="text-xs text-muted-foreground mb-0.5">Pague via PIX</p>
                    <p className="text-2xl font-bold text-primary">R$ {tokenOrder.amount}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">1 ficha extra</p>
                  </div>

                  {tokenOrder.pix.qr_code_base64 && (
                    <div className="flex justify-center p-3 bg-white rounded-xl border border-border">
                      <img
                        src={`data:image/png;base64,${tokenOrder.pix.qr_code_base64}`}
                        alt="QR Code PIX"
                        className="w-48 h-48"
                      />
                    </div>
                  )}

                  {tokenOrder.pix.qr_code && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          readOnly
                          value={tokenOrder.pix.qr_code}
                          className="flex-1 text-xs p-2.5 rounded-lg bg-muted border border-border font-mono truncate text-foreground"
                        />
                        <Button size="sm" variant="outline" onClick={copyPixToken} className="shrink-0">
                          {tokenCopied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                      <Button variant="outline" className="w-full" onClick={copyPixToken}>
                        {tokenCopied
                          ? <><CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />Copiado!</>
                          : <><Copy className="h-4 w-4 mr-2" />Copiar código PIX</>
                        }
                      </Button>
                    </div>
                  )}

                  {pollingTokens && (
                    <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <p className="text-sm text-primary font-medium">Aguardando pagamento...</p>
                    </div>
                  )}

                  <Button variant="ghost" size="sm" className="w-full text-muted-foreground"
                    onClick={() => { setTokenOrder(null); if (pollingTokenRef.current) clearInterval(pollingTokenRef.current); }}>
                    Cancelar
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Volte no próximo mês para jogar novamente!
            </p>
          )}

          <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => window.history.back()}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Voltar à fatura
          </Button>
        </div>
      </div>
    );
  }

  if (screen === "result" && finishData) {
    const won = finishData.result === "won";
    const progressPct = Math.min(
      100,
      Math.round((finishData.winsThisMonth / finishData.winsRequired) * 100)
    );
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
        <div className="glass-card rounded-2xl p-6 max-w-sm w-full space-y-5">
          {/* Resultado */}
          <div className={`text-center py-5 rounded-xl border ${
            won ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
          }`}>
            <p className="text-4xl mb-2">{won ? "🎉" : "😔"}</p>
            <p className={`text-xl font-bold ${won ? "text-green-600" : "text-red-500"}`}>
              {won ? "Você venceu!" : "Você perdeu..."}
            </p>
          </div>

          {/* Prêmio concedido */}
          {finishData.prizeGranted && finishData.discountPercent && (
            <div className="text-center py-4 rounded-xl bg-purple-500/10 border border-purple-500/30 space-y-1">
              <p className="text-3xl">🏆</p>
              <p className="text-lg font-bold text-purple-500">Prêmio desbloqueado!</p>
              <p className="text-muted-foreground text-sm">
                Você ganhou <span className="font-bold text-foreground">{finishData.discountPercent}% de desconto</span> na próxima mensalidade!
              </p>
            </div>
          )}

          {/* Progresso (sem prêmio concedido agora) */}
          {!finishData.prizeGranted && finishData.winsRequired > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progresso do mês</span>
                <span className="font-semibold text-foreground">
                  {finishData.winsThisMonth}/{finishData.winsRequired} vitórias
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5">
                <div
                  className="bg-primary rounded-full h-2.5 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {finishData.discountPercent ? (
                <p className="text-xs text-muted-foreground text-center">
                  Vença mais {finishData.winsRequired - finishData.winsThisMonth} vez(es) para ganhar{" "}
                  <span className="text-primary font-semibold">{finishData.discountPercent}% de desconto</span>!
                </p>
              ) : (
                <p className="text-xs text-muted-foreground text-center">Continue jogando para completar o desafio!</p>
              )}
            </div>
          )}

          {/* Ações */}
          <div className="flex flex-col gap-2">
            <Button onClick={handleNewGame} className="w-full">
              <Gamepad2 className="h-4 w-4 mr-2" />
              Jogar novamente
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => window.history.back()}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Voltar à fatura
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "playing" && session) {
    const progressPct = Math.min(
      100,
      Math.round((session.winsThisMonth / session.winsRequired) * 100)
    );
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
        <div className="glass-card rounded-2xl p-5 max-w-sm w-full space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => window.history.back()}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <Gamepad2 className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">Damas</span>
            </div>
            <div className="w-5" />
          </div>

          {/* Progresso */}
          {session.winsRequired > 1 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Vitórias este mês</span>
                <span className="font-semibold text-foreground">
                  {session.winsThisMonth}/{session.winsRequired}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              {session.discountPercent && !session.prizeAlreadyGranted && (
                <p className="text-xs text-center text-muted-foreground">
                  🎁 Vença {session.winsRequired - session.winsThisMonth} vez(es) para ganhar {session.discountPercent}% off
                </p>
              )}
              {session.prizeAlreadyGranted && (
                <p className="text-xs text-center text-green-600 font-medium">✅ Prêmio já conquistado este mês!</p>
              )}
            </div>
          )}

          {/* Jogo */}
          <CheckersGame
            key={gameKey}
            difficulty={session.difficulty}
            onGameEnd={handleGameEnd}
            onNewGame={handleNewGame}
          />
        </div>
      </div>
    );
  }

  // Screen: info
  if (screen === "info" && gameInfo) {
    const progressPct = Math.min(
      100,
      Math.round((gameInfo.winsThisMonth / gameInfo.winsRequired) * 100)
    );
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
        <div className="glass-card rounded-2xl p-6 max-w-sm w-full space-y-5">
          {/* Header */}
          <div className="text-center space-y-2">
            <span className="text-5xl">♟️</span>
            <h1 className="text-2xl font-bold text-foreground">Damas</h1>
            <p className="text-sm text-muted-foreground">Vença o computador e ganhe prêmios!</p>
          </div>

          {/* Info cards */}
          <div className={`grid gap-3 ${gameInfo.tokenPrice ? "grid-cols-2" : ""}`}>
            <div className="p-3 rounded-xl bg-muted/40 border border-border/40 text-center space-y-0.5">
              <p className="text-xs text-muted-foreground">Partidas grátis</p>
              <p className="text-sm font-bold text-foreground">
                {gameInfo.freeGames === 0 ? "∞ Ilimitadas" :
                  `${Math.max(0, gameInfo.freeGames - gameInfo.gamesUsedThisMonth)}/${gameInfo.freeGames}`}
              </p>
            </div>
            {gameInfo.tokenPrice && (
              <div className="p-3 rounded-xl bg-muted/40 border border-border/40 text-center space-y-0.5">
                <p className="text-xs text-muted-foreground">Fichas disponíveis</p>
                <p className="text-sm font-bold text-foreground">{gameInfo.tokenBalance}</p>
              </div>
            )}
          </div>

          {/* Prêmio */}
          {gameInfo.discountPercent && (
            <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 space-y-1.5">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Prêmio</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Vença <span className="font-bold text-foreground">{gameInfo.winsRequired}</span> partida(s) este mês
                e ganhe <span className="font-bold text-primary">{gameInfo.discountPercent}% de desconto</span>!
              </p>
              {gameInfo.winsRequired > 1 && (
                <>
                  <div className="w-full bg-background rounded-full h-2">
                    <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${progressPct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    {gameInfo.winsThisMonth}/{gameInfo.winsRequired} vitórias este mês
                    {gameInfo.prizeGrantedThisMonth && " · ✅ Prêmio já conquistado!"}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Botão jogar */}
          {gameInfo.freeGames > 0 && gameInfo.gamesUsedThisMonth >= gameInfo.freeGames && gameInfo.tokenBalance <= 0 ? (
            gameInfo.tokenPrice ? (
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center space-y-1">
                  <p className="text-sm text-muted-foreground">Compre uma ficha extra por</p>
                  <p className="text-3xl font-bold text-primary">
                    R$ {Number(gameInfo.tokenPrice).toFixed(2)}
                  </p>
                </div>
                <Button className="w-full" size="lg" onClick={handleStart} disabled={starting}>
                  {starting
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aguarde...</>
                    : <>🎟️ Comprar ficha via PIX</>
                  }
                </Button>
              </div>
            ) : (
              <div className="text-center py-3 rounded-xl bg-muted/40 border border-border/40">
                <p className="text-sm text-muted-foreground">Sem partidas disponíveis este mês.</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">Volte no próximo mês!</p>
              </div>
            )
          ) : (
            <Button className="w-full" size="lg" onClick={handleStart} disabled={starting}>
              {starting
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Iniciando...</>
                : <><Gamepad2 className="h-4 w-4 mr-2" />Jogar agora</>
              }
            </Button>
          )}

          <Button variant="ghost" className="w-full text-muted-foreground text-sm" onClick={() => window.history.back()}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Voltar à fatura
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
