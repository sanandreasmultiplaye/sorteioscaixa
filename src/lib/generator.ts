import type { Lottery } from "./lotteries";

export type Method = "aleatorio" | "equilibrado" | "soma" | "frequencia";

export interface Game {
  numbers: number[];
  extra?: number[] | undefined;
}

const randInt = (min: number, max: number, rnd: () => number) =>
  Math.floor(rnd() * (max - min + 1)) + min;

function pickUnique(min: number, max: number, count: number, rnd: () => number, weights?: Map<number, number>) {
  const pool: number[] = [];
  for (let n = min; n <= max; n++) pool.push(n);
  const out: number[] = [];
  while (out.length < count && pool.length) {
    let idx: number;
    if (weights) {
      const total = pool.reduce((s, n) => s + (weights.get(n) ?? 1), 0);
      let r = rnd() * total;
      idx = 0;
      for (let i = 0; i < pool.length; i++) {
        r -= weights.get(pool[i]!) ?? 1;
        if (r <= 0) { idx = i; break; }
      }
    } else idx = Math.floor(rnd() * pool.length);
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out.sort((a, b) => a - b);
}

export function generateGame(l: Lottery, method: Method, hot: number[] = [], rnd: () => number = Math.random): Game {
  let numbers: number[];
  if (l.columns) {
    numbers = Array.from({ length: l.columns }, () => randInt(l.min, l.max, rnd));
  } else if (method === "equilibrado") {
    const evens = Math.floor(l.pick / 2) + (rnd() < 0.5 ? 0 : l.pick % 2);
    const evenPool: number[] = [], oddPool: number[] = [];
    for (let n = l.min; n <= l.max; n++) (n % 2 === 0 ? evenPool : oddPool).push(n);
    const take = (arr: number[], k: number) => {
      const a = [...arr], r: number[] = [];
      while (r.length < k) r.push(a.splice(Math.floor(rnd() * a.length), 1)[0]!);
      return r;
    };
    numbers = [...take(evenPool, evens), ...take(oddPool, l.pick - evens)].sort((a, b) => a - b);
  } else if (method === "soma") {
    const mean = (l.pick * (l.min + l.max)) / 2;
    const tol = mean * 0.1;
    numbers = pickUnique(l.min, l.max, l.pick, rnd);
    for (let i = 0; i < 500; i++) {
      const s = numbers.reduce((a, b) => a + b, 0);
      if (Math.abs(s - mean) <= tol) break;
      numbers = pickUnique(l.min, l.max, l.pick, rnd);
    }
  } else if (method === "frequencia" && hot.length) {
    const w = new Map<number, number>();
    hot.forEach((n) => w.set(n, (w.get(n) ?? 1) + 3));
    numbers = pickUnique(l.min, l.max, l.pick, rnd, w);
  } else {
    numbers = pickUnique(l.min, l.max, l.pick, rnd);
  }
  const extra = l.extra ? pickUnique(l.extra.min, l.extra.max, l.extra.pick, rnd) : undefined;
  return { numbers, extra };
}
