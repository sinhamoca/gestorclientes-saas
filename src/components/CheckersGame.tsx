// CheckersGame.tsx
// Jogo de Damas com IA — Minimax + Alpha-Beta Pruning
// 4 níveis de dificuldade: easy / medium / hard / pro

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw } from "lucide-react";

// ─────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────
type Piece  = 0 | 1 | 2 | 3 | 4; // 0=vazio 1=jogador 2=ia 3=dama-jogador 4=dama-ia
type Board  = Piece[][];
type Pos    = [number, number];
type Move   = { from: Pos; to: Pos; captures: Pos[] };
export type Difficulty = "easy" | "medium" | "hard" | "pro";

const EMPTY = 0, PLAYER = 1, AI = 2, PLAYER_KING = 3, AI_KING = 4;
const DEPTH_MAP: Record<Difficulty, number> = { easy: 2, medium: 4, hard: 6, pro: 8 };

// ─────────────────────────────────────────────────
// LÓGICA DO TABULEIRO
// ─────────────────────────────────────────────────

function createBoard(): Board {
  const b: Board = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 8; c++)
      if ((r + c) % 2 === 1) b[r][c] = AI;
  for (let r = 5; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if ((r + c) % 2 === 1) b[r][c] = PLAYER;
  return b;
}

/** Busca recursiva de sequências de capturas (multi-salto). */
function findCaptures(
  board: Board, r: number, c: number,
  forPlayer: boolean,
  alreadyCaptured: Pos[],
  originalFrom: Pos
): Move[] {
  const piece = board[r][c];
  const isKing = piece === PLAYER_KING || piece === AI_KING;
  const foes: number[] = forPlayer ? [AI, AI_KING] : [PLAYER, PLAYER_KING];

  const dirs: Pos[] = [];
  if (forPlayer || isKing) dirs.push([-1, -1], [-1, 1]);
  if (!forPlayer || isKing) dirs.push([1, -1], [1, 1]);

  const result: Move[] = [];

  for (const [dr, dc] of dirs) {
    const capR = r + dr, capC = c + dc;
    const landR = r + 2 * dr, landC = c + 2 * dc;

    if (landR < 0 || landR >= 8 || landC < 0 || landC >= 8) continue;
    if (!foes.includes(board[capR][capC])) continue;
    if (board[landR][landC] !== 0) continue;
    if (alreadyCaptured.some(([ar, ac]) => ar === capR && ac === capC)) continue;

    const newCaptured: Pos[] = [...alreadyCaptured, [capR, capC]];

    // Simula o salto para continuar procurando
    const nb: Board = board.map(row => [...row]) as Board;
    nb[landR][landC] = nb[r][c];
    nb[capR][capC]   = 0;
    nb[r][c]         = 0;
    // Promoção no meio do salto
    if (nb[landR][landC] === PLAYER && landR === 0) nb[landR][landC] = PLAYER_KING;
    if (nb[landR][landC] === AI     && landR === 7) nb[landR][landC] = AI_KING;

    const cont = findCaptures(nb, landR, landC, forPlayer, newCaptured, originalFrom);
    if (cont.length === 0) {
      result.push({ from: originalFrom, to: [landR, landC], captures: newCaptured });
    } else {
      result.push(...cont);
    }
  }

  return result;
}

/** Retorna todos os movimentos válidos. Capturas têm prioridade (obrigatórias). */
function getMoves(board: Board, forPlayer: boolean): Move[] {
  const own: number[] = forPlayer ? [PLAYER, PLAYER_KING] : [AI, AI_KING];
  const captures: Move[] = [];
  const regular: Move[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!own.includes(p)) continue;
      const isKing = p === PLAYER_KING || p === AI_KING;

      // Capturas
      captures.push(...findCaptures(board, r, c, forPlayer, [], [r, c]));

      // Movimentos regulares
      const dirs: Pos[] = [];
      if (forPlayer || isKing) dirs.push([-1, -1], [-1, 1]);
      if (!forPlayer || isKing) dirs.push([1, -1], [1, 1]);

      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === 0) {
          regular.push({ from: [r, c], to: [nr, nc], captures: [] });
        }
      }
    }
  }

  return captures.length > 0 ? captures : regular;
}

/** Aplica um movimento ao tabuleiro (imutável). */
function applyMove(board: Board, move: Move): Board {
  const nb: Board = board.map(row => [...row]) as Board;
  const piece = nb[move.from[0]][move.from[1]];
  nb[move.to[0]][move.to[1]]   = piece;
  nb[move.from[0]][move.from[1]] = 0;
  for (const [cr, cc] of move.captures) nb[cr][cc] = 0;
  // Promoção
  if (nb[move.to[0]][move.to[1]] === PLAYER && move.to[0] === 0) nb[move.to[0]][move.to[1]] = PLAYER_KING;
  if (nb[move.to[0]][move.to[1]] === AI     && move.to[0] === 7) nb[move.to[0]][move.to[1]] = AI_KING;
  return nb;
}

// ─────────────────────────────────────────────────
// AVALIAÇÃO HEURÍSTICA
// ─────────────────────────────────────────────────
function evaluate(board: Board): number {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      const center = Math.abs(c - 3.5) < 2 ? 0.5 : 0;
      if (p === PLAYER)      score -= 10 + ((7 - r) * 0.3) + center;
      if (p === PLAYER_KING) score -= 16 + center;
      if (p === AI)          score += 10 + (r * 0.3) + center;
      if (p === AI_KING)     score += 16 + center;
    }
  }
  return score;
}

// ─────────────────────────────────────────────────
// MINIMAX + ALPHA-BETA PRUNING
// maximizing = true → vez da IA
// ─────────────────────────────────────────────────
function minimax(
  board: Board, depth: number,
  alpha: number, beta: number,
  maximizing: boolean
): number {
  const moves = getMoves(board, !maximizing); // !maximizing=true → jogador; false → IA

  if (moves.length === 0) return maximizing ? -1000 : 1000;
  if (depth === 0)        return evaluate(board);

  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      best  = Math.max(best, minimax(applyMove(board, m), depth - 1, alpha, beta, false));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      best = Math.min(best, minimax(applyMove(board, m), depth - 1, alpha, beta, true));
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

/** Escolhe o melhor movimento para a IA com aleatoriedade nos níveis fáceis. */
function getBestMove(board: Board, difficulty: Difficulty): Move | null {
  const moves = getMoves(board, false);
  if (!moves.length) return null;

  // Aleatoriedade por nível (para não parecer robótico no fácil/médio)
  const rng = Math.random();
  if (difficulty === "easy"   && rng < 0.50) return moves[Math.floor(Math.random() * moves.length)];
  if (difficulty === "medium" && rng < 0.20) return moves[Math.floor(Math.random() * moves.length)];

  const depth = DEPTH_MAP[difficulty];
  let best: Move = moves[0];
  let bestScore  = -Infinity;

  for (const m of moves) {
    const score = minimax(applyMove(board, m), depth - 1, -Infinity, Infinity, false);
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

// ─────────────────────────────────────────────────
// COMPONENTE REACT
// ─────────────────────────────────────────────────
export interface CheckersGameProps {
  difficulty: Difficulty;
  onGameEnd: (result: "won" | "lost") => void;
  onNewGame: () => void;
}



export default function CheckersGame({ difficulty, onGameEnd, onNewGame }: CheckersGameProps) {
  const [board,    setBoard]    = useState<Board>(() => createBoard());
  const [turn,     setTurn]     = useState<"player" | "ai">("player");
  const [selected, setSelected] = useState<Pos | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [status,   setStatus]   = useState<"playing" | "won" | "lost">("playing");
  const [thinking, setThinking] = useState(false);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const endCalledRef = useRef(false);

  // Contagem de peças
  const playerCount = board.flat().filter(p => p === PLAYER || p === PLAYER_KING).length;
  const aiCount     = board.flat().filter(p => p === AI    || p === AI_KING).length;

  // ── Verifica condição de vitória ──
  useEffect(() => {
    if (status !== "playing") return;
    const pMoves = getMoves(board, true);
    const aMoves = getMoves(board, false);

    if (aiCount === 0 || aMoves.length === 0) {
      setStatus("won");
      if (!endCalledRef.current) { endCalledRef.current = true; onGameEnd("won"); }
    } else if (playerCount === 0 || pMoves.length === 0) {
      setStatus("lost");
      if (!endCalledRef.current) { endCalledRef.current = true; onGameEnd("lost"); }
    }
  }, [board]);

  // ── Vez da IA ──
  useEffect(() => {
    if (turn !== "ai" || status !== "playing") return;
    setThinking(true);
    const t = setTimeout(() => {
      const move = getBestMove(board, difficulty);
      if (move) {
        setBoard(applyMove(board, move));
        setLastMove(move);
      }
      setThinking(false);
      setTurn("player");
    }, 400 + Math.random() * 400);
    return () => clearTimeout(t);
  }, [turn, board, difficulty, status]);

  // ── Clique no tabuleiro ──
  const handleCell = useCallback((r: number, c: number) => {
    if (turn !== "player" || status !== "playing" || thinking) return;

    const piece = board[r][c];
    const isOwn = piece === PLAYER || piece === PLAYER_KING;

    if (selected) {
      // Tentar mover para a célula clicada
      const move = validMoves.find(m => m.to[0] === r && m.to[1] === c);
      if (move) {
        setBoard(applyMove(board, move));
        setLastMove(move);
        setSelected(null);
        setValidMoves([]);
        setTurn("ai");
        return;
      }
      // Selecionar outra peça
      if (isOwn) {
        const allMoves = getMoves(board, true);
        const hasMandatory = allMoves.some(m => m.captures.length > 0);
        const pieceMoves   = allMoves.filter(m => m.from[0] === r && m.from[1] === c);
        const pieceCaps    = pieceMoves.filter(m => m.captures.length > 0);
        if (hasMandatory && pieceCaps.length === 0) { setSelected(null); setValidMoves([]); return; }
        setSelected([r, c]);
        setValidMoves(hasMandatory ? pieceCaps : pieceMoves);
        return;
      }
      setSelected(null); setValidMoves([]);
      return;
    }

    // Selecionar peça
    if (isOwn) {
      const allMoves = getMoves(board, true);
      const hasMandatory = allMoves.some(m => m.captures.length > 0);
      const pieceMoves   = allMoves.filter(m => m.from[0] === r && m.from[1] === c);
      const pieceCaps    = pieceMoves.filter(m => m.captures.length > 0);
      if (hasMandatory && pieceCaps.length === 0) return; // deve capturar com outra peça
      setSelected([r, c]);
      setValidMoves(hasMandatory ? pieceCaps : pieceMoves);
    }
  }, [turn, status, thinking, board, selected, validMoves]);

  const isTarget = (r: number, c: number) => validMoves.some(m => m.to[0] === r && m.to[1] === c);
  const isLastMv = (r: number, c: number) =>
    lastMove && (
      (lastMove.from[0] === r && lastMove.from[1] === c) ||
      (lastMove.to[0]   === r && lastMove.to[1]   === c)
    );
  const isCaptured = (r: number, c: number) =>
    lastMove?.captures.some(([cr, cc]) => cr === r && cc === c);

  return (
    <div className="space-y-3 select-none">
      {/* Info bar */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-gray-100 border-2 border-gray-300 shadow-sm" />
          <span className="font-bold text-foreground">{playerCount}</span>
          <span className="text-xs text-muted-foreground">suas peças</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">IA</span>
          <span className="font-bold text-foreground">{aiCount}</span>
          <div className="w-5 h-5 rounded-full bg-gray-800 border-2 border-gray-600 shadow-sm" />
        </div>
      </div>

      {/* Indicador de turno */}
      <div className={`flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        thinking ? "bg-muted/50 text-muted-foreground" :
        turn === "player" ? "bg-primary/10 text-primary" :
        "bg-muted/30 text-muted-foreground"
      }`}>
        {thinking
          ? <><Loader2 className="h-3 w-3 animate-spin" />IA está pensando...</>
          : turn === "player"
            ? "🎯 Sua vez — clique em uma peça branca"
            : "⏳ Aguardando IA..."
        }
      </div>

      {/* TABULEIRO */}
      <div
        className="border-2 border-amber-900/50 rounded-lg overflow-hidden mx-auto shadow-lg"
        style={{ width: "min(100%, 336px)", aspectRatio: "1" }}
      >
        {board.map((row, r) => (
          <div key={r} className="flex" style={{ height: "12.5%" }}>
            {row.map((piece, c) => {
              const dark    = (r + c) % 2 === 1;
              const selThis = selected?.[0] === r && selected?.[1] === c;
              const target  = dark && isTarget(r, c);
              const lastMv  = dark && isLastMv(r, c);
              const cap     = dark && isCaptured(r, c);

              let bg = dark ? "bg-amber-800" : "bg-amber-100";
              if (selThis)        bg = "bg-blue-600/70";
              else if (target)    bg = "bg-green-600/50";
              else if (cap)       bg = "bg-red-600/40";
              else if (lastMv)    bg = "bg-amber-600";

              return (
                <div
                  key={c}
                  onClick={() => handleCell(r, c)}
                  className={`relative flex items-center justify-center cursor-pointer transition-colors ${bg}`}
                  style={{ width: "12.5%" }}
                >
                  {/* Marcador de destino válido */}
                  {target && piece === EMPTY && (
                    <div className="absolute w-3 h-3 rounded-full bg-green-400/80 border border-green-300 shadow" />
                  )}

                  {/* Peça */}
                  {piece !== EMPTY && (
                    <div className={`
                      absolute inset-[10%] rounded-full flex items-center justify-center
                      transition-transform shadow-md border-2
                      ${piece === PLAYER || piece === PLAYER_KING
                        ? "bg-gradient-to-br from-gray-50 to-gray-200 border-gray-300 text-gray-700"
                        : "bg-gradient-to-br from-gray-700 to-gray-900 border-gray-500 text-gray-200"
                      }
                      ${selThis ? "scale-110 ring-2 ring-blue-300 ring-offset-1" : ""}
                      ${target && piece !== EMPTY ? "ring-2 ring-red-400" : ""}
                    `}>
                      {(piece === PLAYER_KING || piece === AI_KING) && (
                        <span className="text-[clamp(8px,2vw,14px)] leading-none">♛</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legenda */}
      {status === "playing" && !thinking && turn === "player" && (
        <p className="text-center text-xs text-muted-foreground">
          {selected
            ? validMoves.length > 0
              ? `${validMoves.length} destino(s) disponível — clique no verde`
              : "Sem movimentos para esta peça"
            : "Clique em uma peça branca para ver os movimentos"
          }
        </p>
      )}

      {/* Game over */}
      {status !== "playing" && (
        <div className={`text-center py-4 rounded-xl border ${
          status === "won"
            ? "bg-green-500/10 border-green-500/30"
            : "bg-red-500/10 border-red-500/30"
        }`}>
          <p className={`text-xl font-bold ${status === "won" ? "text-green-600" : "text-red-500"}`}>
            {status === "won" ? "🎉 Você venceu!" : "😔 Você perdeu..."}
          </p>
        </div>
      )}

      {/* Botão nova partida */}
      <Button variant="ghost" size="sm" className="w-full text-muted-foreground hover:text-foreground" onClick={onNewGame}>
        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
        Nova partida
      </Button>
    </div>
  );
}
