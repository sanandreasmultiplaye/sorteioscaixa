import { LOTTERIES, type LotteryId } from "./lotteries";

export interface ParsedTicket {
  lottery: LotteryId | null;
  concurso: number | null;
  numbers: number[];
  raw: string;
}

const KEYWORDS: [RegExp, LotteryId][] = [
  [/mega[\s-]?sena|\bmega\b/i, "megasena"],
  [/lotof[aá]cil/i, "lotofacil"],
  [/quina/i, "quina"],
  [/lotomania/i, "lotomania"],
  [/timemania/i, "timemania"],
  [/dupla[\s-]?sena|\bdupla\b/i, "duplasena"],
  [/dia[\s-]?de[\s-]?sorte|diadesorte/i, "diadesorte"],
  [/super[\s-]?sete|supersete/i, "supersete"],
  [/\+?milion[aá]ria|maismilionaria/i, "maismilionaria"],
];

/** Parses the raw text decoded from a Caixa receipt QR code. */
export function parseTicketQr(raw: string): ParsedTicket {
  const text = raw.trim();
  const upper = text.toUpperCase();

  let lottery: LotteryId | null = null;
  for (const [re, id] of KEYWORDS) {
    if (re.test(upper)) { lottery = id; break; }
  }

  let concurso: number | null = null;
  const cm = upper.match(/CONCURSO[:\sNº°-]*(\d{1,5})/i);
  if (cm) concurso = Number(cm[1]);

  // Number tokens of 1-2 digits (dezenas)
  const tokens = (text.match(/\d{1,2}/g) ?? []).map(Number);

  let numbers: number[] = [];
  if (lottery) {
    const l = LOTTERIES.find((x) => x.id === lottery)!;
    const inRange = tokens.filter((n) => n >= l.min && n <= l.max);
    // Sliding window: find the first run of `pick` unique in-range numbers
    for (let i = 0; i + l.pick <= inRange.length; i++) {
      const slice = inRange.slice(i, i + l.pick);
      if (new Set(slice).size === l.pick) { numbers = slice; break; }
    }
    // Concurso fallback: a 3-5 digit token in the raw text
    if (!concurso) {
      const big = text.match(/\b(\d{3,5})\b/);
      if (big) concurso = Number(big[1]);
    }
  }

  return { lottery, concurso, numbers, raw: text };
}
