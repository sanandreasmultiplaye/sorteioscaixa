import type { LotteryId } from "./lotteries";

export interface SavedGame {
  id: string;
  lottery: LotteryId;
  numbers: number[];
  extra?: number[];
  /** concurso alvo; se ausente, confere contra o último resultado */
  concurso?: number;
  savedAt: number;
}

const KEY = "loterias-jogos-salvos";

export function loadGames(): SavedGame[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((g) => g && Array.isArray(g.numbers)) : [];
  } catch {
    return [];
  }
}

export function saveGames(games: Omit<SavedGame, "id" | "savedAt">[]): SavedGame[] {
  const current = loadGames();
  const now = Date.now();
  const fresh = games.map((g, i) => ({ ...g, id: `${now}-${i}-${Math.random().toString(36).slice(2, 8)}`, savedAt: now }));
  const all = [...fresh, ...current].slice(0, 200);
  localStorage.setItem(KEY, JSON.stringify(all));
  return all;
}

export function removeGame(id: string): SavedGame[] {
  const all = loadGames().filter((g) => g.id !== id);
  localStorage.setItem(KEY, JSON.stringify(all));
  return all;
}

export function clearGames(): void {
  localStorage.removeItem(KEY);
}

/** Counts how many numbers of the game appear in the drawn numbers. */
export function countHits(game: number[], drawn: number[]): { hits: number; matched: number[] } {
  const set = new Set(drawn);
  const matched = game.filter((n) => set.has(n));
  return { hits: matched.length, matched };
}
