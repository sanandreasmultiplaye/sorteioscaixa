export type LotteryId =
  | "megasena"
  | "lotofacil"
  | "quina"
  | "lotomania"
  | "timemania"
  | "duplasena"
  | "diadesorte"
  | "supersete"
  | "maismilionaria";

export interface Lottery {
  id: LotteryId;
  name: string;
  min: number;
  max: number;
  pick: number;
  /** Super Sete: one digit 0-9 per column */
  columns?: number;
  extra?: { label: string; min: number; max: number; pick: number; names?: string[] };
  pad: number;
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export const LOTTERIES: Lottery[] = [
  { id: "megasena", name: "Mega-Sena", min: 1, max: 60, pick: 6, pad: 2 },
  { id: "lotofacil", name: "Lotofácil", min: 1, max: 25, pick: 15, pad: 2 },
  { id: "quina", name: "Quina", min: 1, max: 80, pick: 5, pad: 2 },
  { id: "lotomania", name: "Lotomania", min: 0, max: 99, pick: 50, pad: 2 },
  { id: "timemania", name: "Timemania", min: 1, max: 80, pick: 10, pad: 2 },
  { id: "duplasena", name: "Dupla Sena", min: 1, max: 50, pick: 6, pad: 2 },
  {
    id: "diadesorte", name: "Dia de Sorte", min: 1, max: 31, pick: 7, pad: 2,
    extra: { label: "Mês da Sorte", min: 1, max: 12, pick: 1, names: MESES },
  },
  { id: "supersete", name: "Super Sete", min: 0, max: 9, pick: 7, columns: 7, pad: 1 },
  {
    id: "maismilionaria", name: "+Milionária", min: 1, max: 50, pick: 6, pad: 2,
    extra: { label: "Trevos", min: 1, max: 6, pick: 2 },
  },
];

export const getLottery = (id: LotteryId) => LOTTERIES.find((l) => l.id === id)!;
export const fmt = (n: number, pad: number) => String(n).padStart(pad, "0");
