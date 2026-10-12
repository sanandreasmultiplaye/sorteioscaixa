import { createServerFn } from "@tanstack/react-start";

export interface LotteryResult {
  id: string;
  concurso: number | null;
  data: string | null;
  dezenas: string[];
  dezenas2: string[];
  extra: string[];
  ganhadores: number;
  locais: { qtd: number; local: string }[];
  acumulou: boolean;
  proximoEstimado: number | null;
  proximoData: string | null;
  proximoConcurso: number | null;
  premio: number | null;
  error?: string;
}

const IDS = ["megasena", "lotofacil", "quina", "lotomania", "timemania", "duplasena", "diadesorte", "supersete", "maismilionaria"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function locaisFrom(list: Any[] | undefined) {
  const map = new Map<string, number>();
  for (const it of list ?? []) {
    const qtd = Number(it.ganhadores ?? it.quantidade ?? 1) || 1;
    const mun = String(it.municipio ?? it.nomeMunicipio ?? "").trim();
    const uf = String(it.uf ?? it.siglaUF ?? "").trim();
    let local: string;
    if (/canal|eletr/i.test(mun) || /canal|eletr/i.test(uf) || uf === "--" || uf === "BR") local = "Canal Eletrônico";
    else if (mun && uf) local = `${mun} - ${uf}`;
    else local = uf || mun || "Local não informado";
    map.set(local, (map.get(local) ?? 0) + qtd);
  }
  return [...map.entries()].map(([local, qtd]) => ({ local, qtd }));
}

function fromCaixa(id: string, d: Any): LotteryResult {
  const faixa1 = (d.listaRateioPremio ?? [])[0] ?? {};
  return {
    id,
    concurso: d.numero ?? null,
    data: d.dataApuracao ?? null,
    dezenas: d.listaDezenas ?? d.dezenasSorteadasOrdemSorteio ?? [],
    dezenas2: d.listaDezenasSegundoSorteio ?? [],
    extra: [d.nomeTimeCoracaoMesSorte, ...(d.trevosSorteados ?? [])].filter((x) => x && String(x).trim()),
    ganhadores: Number(faixa1.numeroDeGanhadores ?? 0),
    locais: locaisFrom(d.listaMunicipioUFGanhadores),
    acumulou: !!d.acumulado,
    proximoEstimado: d.valorEstimadoProximoConcurso ?? null,
    proximoData: d.dataProximoConcurso ?? null,
    proximoConcurso: d.proximoConcurso ?? null,
    premio: faixa1.valorPremio ?? null,
  };
}

function fromAlt(id: string, d: Any): LotteryResult {
  const faixa1 = (d.premiacoes ?? [])[0] ?? {};
  let locais = locaisFrom(d.localGanhadores);
  if (!locais.length && Array.isArray(d.estadosPremiados)) {
    locais = d.estadosPremiados.map((e: Any) => ({ qtd: Number(e.vencedores ?? e.ganhadores ?? 1), local: e.uf ?? e.nome ?? "Local não informado" }));
  }
  const dz: string[] = d.dezenas ?? [];
  const half = id === "duplasena" && dz.length === 12;
  return {
    id,
    concurso: d.concurso ?? null,
    data: d.data ?? null,
    dezenas: half ? dz.slice(0, 6) : dz,
    dezenas2: half ? dz.slice(6) : [],
    extra: [d.mesSorte, d.timeCoracao, ...(d.trevos ?? [])].filter((x) => x && String(x).trim()),
    ganhadores: Number(faixa1.ganhadores ?? 0),
    locais,
    acumulou: !!d.acumulou,
    proximoEstimado: d.valorEstimadoProximoConcurso ?? null,
    proximoData: d.dataProximoConcurso ?? null,
    proximoConcurso: d.proximoConcurso ?? null,
    premio: faixa1.valorPremio ?? null,
  };
}

async function getJson(url: string) {
  const sep = url.includes("?") ? "&" : "?";
  const r = await fetch(`${url}${sep}_=${Date.now()}`, {
    cache: "no-store",
    headers: { accept: "application/json", "user-agent": "Mozilla/5.0", "cache-control": "no-cache", pragma: "no-cache" },
    signal: AbortSignal.timeout(9000),
  });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

function emptyResult(id: string, error: string): LotteryResult {
  return { id, concurso: null, data: null, dezenas: [], dezenas2: [], extra: [], ganhadores: 0, locais: [], acumulou: false, proximoEstimado: null, proximoData: null, proximoConcurso: null, premio: null, error };
}

/** Queries both sources in parallel and keeps the most recent draw. */
async function fetchOne(id: string, concurso?: number): Promise<LotteryResult> {
  const suffix = concurso ? `/${concurso}` : "";
  const [a, b] = await Promise.allSettled([
    getJson(`https://servicebus2.caixa.gov.br/portaldeloterias/api/${id}${suffix}`).then((d) => fromCaixa(id, d)),
    getJson(`https://loteriascaixa-api.herokuapp.com/api/${id}${concurso ? suffix : "/latest"}`).then((d) => fromAlt(id, d)),
  ]);
  const ok = [a, b]
    .filter((x): x is PromiseFulfilledResult<LotteryResult> => x.status === "fulfilled")
    .map((x) => x.value)
    .filter((r) => r.concurso && r.dezenas.length && (!concurso || r.concurso === concurso));
  if (!ok.length) return emptyResult(id, concurso ? `Concurso ${concurso} não encontrado` : "Não foi possível carregar");
  return ok.sort((x, y) => (y.concurso ?? 0) - (x.concurso ?? 0))[0]!;
}

export const getResults = createServerFn({ method: "GET" }).handler(async () => {
  return Promise.all(IDS.map((id) => fetchOne(id)));
});

export const getResultByConcurso = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string; concurso: number }) => {
    if (!IDS.includes(d.id)) throw new Error("Loteria inválida");
    const c = Math.floor(Number(d.concurso));
    if (!(c > 0 && c < 100000)) throw new Error("Concurso inválido");
    return { id: d.id, concurso: c };
  })
  .handler(async ({ data }) => fetchOne(data.id, data.concurso));
