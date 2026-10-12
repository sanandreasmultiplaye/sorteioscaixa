import { describe, it, expect } from "vitest";
import { generateGame } from "./generator";
import { getLottery, LOTTERIES } from "./lotteries";

describe("gerador", () => {
  it("cada loteria gera a quantidade certa de números dentro do intervalo", () => {
    for (const l of LOTTERIES) {
      for (const m of ["aleatorio", "equilibrado", "soma", "frequencia"] as const) {
        const g = generateGame(l, m, [1, 2, 3]);
        expect(g.numbers).toHaveLength(l.pick);
        g.numbers.forEach((n) => { expect(n).toBeGreaterThanOrEqual(l.min); expect(n).toBeLessThanOrEqual(l.max); });
        if (!l.columns) expect(new Set(g.numbers).size).toBe(l.pick);
      }
    }
  });
  it("Mega-Sena equilibrado tem 3 pares e 3 ímpares", () => {
    const g = generateGame(getLottery("megasena"), "equilibrado");
    expect(g.numbers.filter((n) => n % 2 === 0)).toHaveLength(3);
  });
  it("+Milionária gera 2 trevos entre 1 e 6", () => {
    const g = generateGame(getLottery("maismilionaria"), "aleatorio");
    expect(g.extra).toHaveLength(2);
    g.extra!.forEach((n) => expect(n).toBeLessThanOrEqual(6));
  });
});
