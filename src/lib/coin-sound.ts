const KEY = "loterias-som";
export const soundEnabled = () => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } };
export const setSoundEnabled = (on: boolean) => { try { localStorage.setItem(KEY, on ? "on" : "off"); } catch {} };

/** Synthesizes a cascade of metallic coin clinks with the Web Audio API. */
export function playCoins() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    for (let i = 0; i < 7; i++) {
      const t = now + i * 0.09 + Math.random() * 0.03;
      [1, 1.5].forEach((mult) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime((1800 + Math.random() * 900) * mult, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25 / mult, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.4);
      });
    }
    setTimeout(() => ctx.close(), 1500);
  } catch {}
}

/** Minimum hits for the lowest prize tier of each lottery. */
export const MIN_PRIZE: Record<string, number> = {
  megasena: 4, lotofacil: 11, quina: 2, lotomania: 15, timemania: 3,
  duplasena: 3, diadesorte: 4, supersete: 3, maismilionaria: 2,
};
