import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { LOTTERIES, getLottery, fmt, type LotteryId, type Lottery } from "@/lib/lotteries";
import { generateGame, type Game, type Method } from "@/lib/generator";
import { getResults, getResultByConcurso, type LotteryResult } from "@/lib/results.functions";
import { loadGames, saveGames, removeGame, clearGames, countHits, type SavedGame } from "@/lib/tickets";
import { playCoins, soundEnabled, setSoundEnabled, MIN_PRIZE } from "@/lib/coin-sound";
import { pushSupported, loadPrefs, enablePush, updatePrefs, disablePush, currentSubscription, ASKED, type PushPrefs } from "@/lib/push-client";
import { parseTicketQr, type ParsedTicket } from "@/lib/qr-parse";

const QrScannerModal = lazy(() => import("@/components/QrScanner"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Loterias Caixa Gerador — Jogos e Resultados" },
      { name: "description", content: "Gere jogos da Mega-Sena, Lotofácil, Quina e mais. Confira os últimos resultados e onde saíram os ganhadores." },
      { property: "og:title", content: "Loterias Caixa Gerador" },
      { property: "og:description", content: "Gere jogos das loterias da Caixa e veja os últimos resultados." },
    ],
  }),
  component: Index,
});

const METHODS: { id: Method; label: string; hint: string }[] = [
  { id: "aleatorio", label: "Aleatório", hint: "Sorteio totalmente ao acaso" },
  { id: "equilibrado", label: "Equilibrado", hint: "Metade pares, metade ímpares" },
  { id: "soma", label: "Por Soma", hint: "Soma próxima da média" },
  { id: "frequencia", label: "Frequência", hint: "Favorece números do último sorteio" },
];
const QTDS = [1, 2, 3, 5, 10];

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };
  return { dark, toggle };
}

function useInstall() {
  const [evt, setEvt] = useState<any>(null);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  return evt ? async () => { evt.prompt(); await evt.userChoice; setEvt(null); } : null;
}

const resultsQuery = { queryKey: ["results"], queryFn: () => getResults(), staleTime: 5 * 60_000 };

type Tab = "gerar" | "resultados" | "proximos" | "conferir";

function closeTime(data: string | null) {
  const m = data?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!, 22, 0) : null; // 19h Brasília
}
function countdown(data: string | null, now: number) {
  const t = closeTime(data);
  if (!t) return "Data não informada";
  const ms = t - now;
  if (ms <= 0) return "Apostas encerradas";
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), min = Math.floor((ms % 3600000) / 60000);
  return `Faltam ${d ? `${d}d ${h}h` : h ? `${h}h ${min}min` : `${min}min`} para apostar`;
}

function Ticker({ onPick, onClose }: { onPick: (id: LotteryId) => void; onClose: () => void }) {
  const q = useQuery(resultsQuery);
  const [i, setI] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const a = setInterval(() => setI((x) => x + 1), 30_000);
    const b = setInterval(() => setNow(Date.now()), 30_000);
    return () => { clearInterval(a); clearInterval(b); };
  }, []);
  const list = (q.data ?? []).filter((r) => r.proximoEstimado).sort((a, b) => (b.proximoEstimado ?? 0) - (a.proximoEstimado ?? 0));
  if (!list.length) return null;
  const r = list[i % list.length]!;
  return (
    <div className="mt-4 flex items-stretch gap-1 rounded-2xl bg-background/15 backdrop-blur">
      <button key={r.id} onClick={() => onPick(r.id as LotteryId)} className="animate-pop min-w-0 flex-1 px-3 py-2 text-left">
        <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase opacity-80">
          <span>💰 {getLottery(r.id as LotteryId).name}</span>
          <span>{(i % list.length) + 1}/{list.length}</span>
        </div>
        <div className="font-display text-lg font-bold leading-tight">{brl(r.proximoEstimado)}</div>
        <div className="text-xs opacity-90">⏳ {countdown(r.proximoData, now)} • toque para jogar</div>
      </button>
      <button onClick={onClose} aria-label="Silenciar letreiro" className="px-3 text-sm opacity-80">✕</button>
    </div>
  );
}

function AskNotifications({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <div className="shadow-card mb-4 rounded-2xl border-2 border-primary bg-card p-4">
      <p className="font-bold">🔔 Quer receber notificações fora do app?</p>
      <p className="mt-1 text-xs text-muted-foreground">Avisamos no seu celular quando sair o resultado das loterias que você escolher, mesmo com o app fechado.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={onNo} className="h-12 rounded-xl border font-bold">Agora não</button>
        <button onClick={onYes} className="h-12 rounded-xl bg-primary font-bold text-primary-foreground">Sim, quero</button>
      </div>
    </div>
  );
}

function NotifPanel({ onClose, tickerOn, setTickerOn }: { onClose: () => void; tickerOn: boolean; setTickerOn: (v: boolean) => void }) {
  const [prefs, setPrefs] = useState<PushPrefs>(() => loadPrefs());
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { currentSubscription().then((s) => setActive(!!s && Notification.permission === "granted")).catch(() => {}); }, []);

  const change = (p: PushPrefs) => { setPrefs(p); if (active) updatePrefs(p).catch(() => setMsg("Não foi possível salvar.")); else localStorage.setItem("push-prefs", JSON.stringify(p)); };
  const toggle = (id: LotteryId) => change({ ...prefs, lotteries: prefs.lotteries.includes(id) ? prefs.lotteries.filter((x) => x !== id) : [...prefs.lotteries, id] });
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setMsg("");
    try { await fn(); setMsg(ok); } catch (e) { setMsg(e instanceof Error ? e.message : "Erro"); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-foreground/40" onClick={onClose}>
      <div className="mx-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">🔔 Notificações</h2>
          <button onClick={onClose} className="h-10 w-10 rounded-full bg-card font-bold">✕</button>
        </div>
        {active ? (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button disabled={busy} onClick={() => run(() => enablePush(prefs, true), "Teste enviado! Deve chegar em instantes.")} className="h-12 rounded-xl border-2 border-primary font-bold text-primary">Enviar teste</button>
            <button disabled={busy} onClick={() => run(async () => { await disablePush(); setActive(false); }, "Notificações desativadas.")} className="h-12 rounded-xl border font-bold text-destructive">Desativar</button>
          </div>
        ) : (
          <button disabled={busy} onClick={() => run(async () => { await enablePush(prefs, true); setActive(true); }, "Pronto! Você receberá os avisos neste aparelho.")} className="bg-hero mb-3 h-14 w-full rounded-2xl font-bold text-primary-foreground dark:text-foreground">
            {busy ? "Ativando..." : "Ativar notificações no celular"}
          </button>
        )}
        {msg && <p className="mb-3 rounded-xl bg-card p-3 text-sm">{msg}</p>}
        <div className="mb-2 flex items-center justify-between text-sm">
          <b>Avisar resultados de:</b>
          <div className="flex gap-3 text-xs font-bold text-primary">
            <button onClick={() => change({ ...prefs, lotteries: LOTTERIES.map((l) => l.id) })}>Marcar todas</button>
            <button onClick={() => change({ ...prefs, lotteries: [] })}>Desmarcar</button>
          </div>
        </div>
        <div className="space-y-1.5">
          {LOTTERIES.map((l) => (
            <Switch key={l.id} label={l.name} on={prefs.lotteries.includes(l.id)} onChange={() => toggle(l.id)} />
          ))}
        </div>
        <h3 className="mb-2 mt-4 text-sm font-bold">Outros avisos</h3>
        <div className="space-y-1.5">
          <Switch label="⏰ Lembrete no dia do sorteio (antes das 19h)" on={prefs.reminders} onChange={() => change({ ...prefs, reminders: !prefs.reminders })} />
          <Switch label="💰 Letreiro de prêmios no topo do app" on={tickerOn} onChange={() => setTickerOn(!tickerOn)} />
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">Funciona sem login. No iPhone, é preciso instalar o app na tela inicial para receber avisos.</p>
      </div>
    </div>
  );
}

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} role="switch" aria-checked={on} className="flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3 text-left text-sm font-bold">
      {label}
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-primary" : "bg-muted"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function Index() {
  const [tab, setTab] = useState<Tab>("gerar");
  const [genLot, setGenLot] = useState<LotteryId>("megasena");
  const [genKey, setGenKey] = useState(0);
  const [panel, setPanel] = useState(false);
  const [ask, setAsk] = useState(false);
  const [tickerOn, setTickerOnState] = useState(false);
  const { dark, toggle } = useTheme();
  const install = useInstall();

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const t = p.get("tab") as Tab | null;
    if (t && ["gerar", "resultados", "proximos", "conferir"].includes(t)) setTab(t);
    const l = p.get("lot") as LotteryId | null;
    if (l && LOTTERIES.some((x) => x.id === l)) { setGenLot(l); setGenKey((k) => k + 1); }
    if (p.size) history.replaceState(null, "", "/");
    setTickerOnState(localStorage.getItem("ticker-off") !== "1");
    if (pushSupported() && !localStorage.getItem(ASKED) && Notification.permission === "default") setAsk(true);
  }, []);

  const setTickerOn = (v: boolean) => { setTickerOnState(v); localStorage.setItem("ticker-off", v ? "0" : "1"); };
  const pickLottery = (id: LotteryId) => { setGenLot(id); setGenKey((k) => k + 1); setTab("gerar"); window.scrollTo({ top: 0 }); };
  const answerAsk = (yes: boolean) => { localStorage.setItem(ASKED, "1"); setAsk(false); if (yes) setPanel(true); };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col pb-28">
      <header className="bg-hero rounded-b-[2rem] px-5 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))] text-primary-foreground dark:text-foreground">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <img src="/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 rounded-xl" />
            <div>
              <h1 className="text-lg font-bold leading-tight">Loterias Caixa</h1>
              <p className="text-xs opacity-80">Gerador de jogos & resultados</p>
            </div>
          </div>
          <div className="flex gap-2">
            {install && (
              <button onClick={install} className="h-10 rounded-full bg-background/20 px-3 text-xs font-bold backdrop-blur">Instalar</button>
            )}
            <button onClick={() => setPanel(true)} aria-label="Notificações" className="grid h-10 w-10 place-items-center rounded-full bg-background/20 text-lg backdrop-blur">🔔</button>
            <button onClick={toggle} aria-label="Alternar tema" className="grid h-10 w-10 place-items-center rounded-full bg-background/20 text-lg backdrop-blur">
              {dark ? "☀️" : "🌙"}
            </button>
          </div>
        </div>
        {tickerOn && <Ticker onPick={pickLottery} onClose={() => setTickerOn(false)} />}
      </header>

      <main className="flex-1 px-4 pt-5">
        {ask && <AskNotifications onYes={() => answerAsk(true)} onNo={() => answerAsk(false)} />}
        {tab === "gerar" ? <Generator key={genKey} initialLot={genLot} /> : tab === "resultados" ? <Results /> : tab === "proximos" ? <NextDraws /> : <Checker />}
      </main>
      {panel && <NotifPanel onClose={() => setPanel(false)} tickerOn={tickerOn} setTickerOn={setTickerOn} />}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1.5 p-2">
          {([["gerar", "🎲", "Gerar"], ["resultados", "🏆", "Resultados"], ["proximos", "📅", "Próximos"], ["conferir", "✅", "Conferir"]] as const).map(([id, icon, label]) => (
            <button
              key={id}
              onClick={() => { setTab(id); window.scrollTo({ top: 0 }); }}
              className={`flex h-14 flex-col items-center justify-center rounded-2xl text-sm font-bold transition ${tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              <span className="text-lg leading-none">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Ball({ value, extra, small, delay = 0 }: { value: string; extra?: boolean; small?: boolean; delay?: number }) {
  return (
    <span
      style={{ animationDelay: `${delay}ms` }}
      className={`${extra ? "ball-extra" : "ball"} animate-pop inline-grid shrink-0 place-items-center rounded-full font-display font-bold ${small ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"}`}
    >
      {value}
    </span>
  );
}

function extraLabel(l: Lottery, n: number) {
  return l.extra?.names ? l.extra.names[n - 1] : String(n);
}

function Generator({ initialLot = "megasena" }: { initialLot?: LotteryId }) {
  const [lot, setLot] = useState<LotteryId>(initialLot);
  const [qtd, setQtd] = useState(1);
  const [method, setMethod] = useState<Method>("aleatorio");
  const [games, setGames] = useState<Game[]>([]);
  const [seed, setSeed] = useState(0);
  const [savedMsg, setSavedMsg] = useState(false);
  const [manual, setManual] = useState(false);
  const [picks, setPicks] = useState<number[]>([]);
  const l = getLottery(lot);
  const results = useQuery({ ...resultsQuery, enabled: method === "frequencia" });

  const generate = () => {
    const r = results.data?.find((x) => x.id === lot);
    const hot = [...(r?.dezenas ?? []), ...(r?.dezenas2 ?? [])].map(Number);
    setGames(Array.from({ length: qtd }, () => generateGame(l, method, hot)));
    setSeed((s) => s + 1);
    navigator.vibrate?.(30);
  };

  const finishManual = (complete: boolean) => {
    const pool: number[] = [];
    for (let n = l.min; n <= l.max; n++) if (!picks.includes(n)) pool.push(n);
    const nums = [...picks];
    if (complete) while (nums.length < l.pick) nums.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
    const extra = generateGame(l, "aleatorio").extra;
    setPicks(nums);
    setGames([{ numbers: nums.sort((a, b) => a - b), extra }]);
    setSeed((s) => s + 1);
    navigator.vibrate?.(30);
  };

  const shareText = () => {
    const lines = games.map((g, i) => {
      const nums = g.numbers.map((n) => fmt(n, l.pad)).join(" - ");
      const ex = g.extra ? ` | ${l.extra!.label}: ${g.extra.map((n) => extraLabel(l, n)).join(", ")}` : "";
      return `Jogo ${i + 1}: ${nums}${ex}`;
    });
    return `🍀 *${l.name}* — meus jogos\n\n${lines.join("\n")}\n\nGerado no app Loterias Caixa Gerador`;
  };

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 text-sm font-bold text-muted-foreground">Escolha a loteria</h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {LOTTERIES.map((x) => (
            <button
              key={x.id}
              onClick={() => { setLot(x.id); setGames([]); setPicks([]); }}
              className={`h-11 shrink-0 rounded-full border px-4 text-sm font-bold transition ${lot === x.id ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}
            >
              {x.name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {l.columns ? `${l.columns} colunas de 0 a 9` : `${l.pick} números de ${fmt(l.min, l.pad)} a ${l.max}`}
          {l.extra ? ` + ${l.extra.label}` : ""}
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-muted-foreground">Quantidade de jogos</h2>
        <div className="grid grid-cols-5 gap-2">
          {QTDS.map((q) => (
            <button key={q} onClick={() => setQtd(q)} className={`h-12 rounded-xl border text-base font-bold ${qtd === q ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>
              {q}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-muted-foreground">Método de geração</h2>
        <div className="grid grid-cols-2 gap-2">
          {METHODS.map((m) => (
            <button key={m.id} onClick={() => { setMethod(m.id); setManual(false); }} className={`rounded-xl border p-3 text-left ${!manual && method === m.id ? "border-primary bg-accent" : "bg-card"}`}>
              <div className="text-sm font-bold">{m.label}</div>
              <div className="text-[11px] leading-tight text-muted-foreground">{m.hint}</div>
            </button>
          ))}
          <button onClick={() => { setManual(true); setPicks([]); }} className={`col-span-2 rounded-xl border p-3 text-left ${manual ? "border-primary bg-accent" : "bg-card"}`}>
            <div className="text-sm font-bold">✍️ Manual (volante)</div>
            <div className="text-[11px] leading-tight text-muted-foreground">Escolha seus números e complete o resto com aleatórios, se quiser</div>
          </button>
        </div>
      </section>

      {manual && l.columns ? (
        <p className="rounded-2xl bg-card p-4 text-center text-sm text-muted-foreground">O modo manual não está disponível para o Super Sete. Use um método automático.</p>
      ) : manual ? (
        <section className="space-y-3 rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <b>Marcados: {picks.length}/{l.pick}</b>
            {picks.length > 0 && <button onClick={() => setPicks([])} className="text-xs font-bold text-destructive">Limpar</button>}
          </div>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: l.max - l.min + 1 }, (_, i) => l.min + i).map((n) => {
              const on = picks.includes(n);
              return (
                <button
                  key={n}
                  onClick={() => setPicks((p) => on ? p.filter((x) => x !== n) : p.length < l.pick ? [...p, n] : p)}
                  className={`aspect-square rounded-lg text-[11px] font-bold ${on ? "ball" : "border bg-background text-muted-foreground"}`}
                >
                  {fmt(n, l.pad)}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => finishManual(true)} disabled={picks.length >= l.pick} className="h-14 rounded-2xl border-2 border-primary font-bold text-primary disabled:opacity-40">🎲 Completar aleatório</button>
            <button onClick={() => finishManual(false)} disabled={picks.length !== l.pick} className="bg-hero h-14 rounded-2xl font-bold text-primary-foreground disabled:opacity-40 dark:text-foreground">✅ Usar jogo</button>
          </div>
        </section>
      ) : (
        <button onClick={generate} className="bg-hero shadow-card h-16 w-full rounded-2xl font-display text-lg font-bold text-primary-foreground active:scale-[0.98] dark:text-foreground">
          🎲 Gerar {qtd > 1 ? `${qtd} jogos` : "jogo"}
        </button>
      )}

      {games.length > 0 && (
        <section className="space-y-3" key={seed}>
          {games.map((g, i) => (
            <div key={i} className="shadow-card rounded-2xl border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Jogo {i + 1}</span>
                <span className="text-xs text-muted-foreground">{l.name}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.numbers.map((n, j) => (
                  <Ball key={j} value={fmt(n, l.pad)} small={l.pick > 10} delay={j * 25} />
                ))}
              </div>
              {g.extra && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                  <span className="text-xs font-bold text-muted-foreground">{l.extra!.label}:</span>
                  {l.extra!.names
                    ? <span className="ball-extra rounded-full px-3 py-1.5 text-sm font-bold">{extraLabel(l, g.extra[0] ?? 1)}</span>
                    : g.extra.map((n, j) => <Ball key={j} value={String(n)} extra />)}
                </div>
              )}
            </div>
          ))}
          <button
            onClick={() => {
              saveGames(games.map((g) => ({ lottery: lot, numbers: g.numbers, ...(g.extra ? { extra: g.extra } : {}) })));
              setSavedMsg(true);
              setTimeout(() => setSavedMsg(false), 2500);
              navigator.vibrate?.(30);
            }}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary bg-card font-bold text-primary active:scale-[0.98]"
          >
            {savedMsg ? "✅ Jogos salvos! Veja na aba Conferir" : "💾 Salvar jogos para conferir"}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText())}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-whatsapp font-display text-lg font-bold text-primary-foreground shadow-card active:scale-[0.98]"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-hidden><path d="M17.5 14.4c-.3-.2-1.8-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5 2.5 1 3 .8 3.6.7.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z" /></svg>
            Compartilhar no WhatsApp
          </a>
        </section>
      )}
      <p className="text-center text-[11px] text-muted-foreground">Os jogos são sugestões. Nenhum método aumenta as chances reais de ganhar.</p>
    </div>
  );
}

const brl = (v: number | null) => v == null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function ConcursoSearch() {
  const [lot, setLot] = useState<LotteryId>("megasena");
  const [num, setNum] = useState("");
  const [res, setRes] = useState<LotteryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const search = async () => {
    const n = Number(num);
    if (!n) return;
    setLoading(true);
    try { setRes(await getResultByConcurso({ data: { id: lot, concurso: n } })); }
    catch { setRes({ id: lot, concurso: null, data: null, dezenas: [], dezenas2: [], extra: [], ganhadores: 0, locais: [], acumulou: false, proximoEstimado: null, proximoData: null, proximoConcurso: null, premio: null, error: "Concurso inválido" }); }
    finally { setLoading(false); }
  };
  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4">
      <h2 className="text-sm font-bold">Consultar concurso específico</h2>
      <select value={lot} onChange={(e) => { setLot(e.target.value as LotteryId); setRes(null); }} className="h-12 w-full rounded-xl border bg-background px-3 text-sm font-bold">
        {LOTTERIES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      <div className="flex gap-2">
        <input inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Nº do concurso" className="h-12 min-w-0 flex-1 rounded-xl border bg-background px-3 text-base" />
        <button onClick={search} disabled={loading || !num} className="h-12 rounded-xl bg-primary px-5 font-bold text-primary-foreground disabled:opacity-60">{loading ? "..." : "Buscar"}</button>
      </div>
      {res && <ResultCard r={res} />}
    </section>
  );
}

function Results() {
  const q = useQuery({ ...resultsQuery, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true });
  return (
    <div className="space-y-3">
      <button
        onClick={() => q.refetch()}
        disabled={q.isFetching}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-bold text-primary-foreground disabled:opacity-60"
      >
        <span className={q.isFetching ? "animate-spin" : ""}>🔄</span>
        {q.isFetching ? "Atualizando..." : "Atualizar resultados"}
      </button>
      <ConcursoSearch />
      <h2 className="pt-1 text-sm font-bold text-muted-foreground">Últimos concursos</h2>
      {q.isLoading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />)}
      {q.isError && <p className="rounded-2xl bg-card p-4 text-center text-sm">Não foi possível carregar. Verifique sua conexão e tente novamente.</p>}
      {q.data?.map((r) => <ResultCard key={r.id} r={r} />)}
    </div>
  );
}

function Checker() {
  const [games, setGames] = useState<SavedGame[]>([]);
  const [lot, setLot] = useState<LotteryId>("megasena");
  const [nums, setNums] = useState("");
  const [conc, setConc] = useState("");
  const [addError, setAddError] = useState("");
  const [byConcurso, setByConcurso] = useState<Record<string, LotteryResult>>({});
  const q = useQuery(resultsQuery);
  const [sound, setSound] = useState(true);
  const played = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<ParsedTicket | null>(null);
  const [scanMsg, setScanMsg] = useState("");
  useEffect(() => { setSound(soundEnabled()); }, []);
  useEffect(() => {
    if (played.current || !soundEnabled()) return;
    const win = games.some((g) => {
      const r = g.concurso ? byConcurso[`${g.lottery}-${g.concurso}`] : q.data?.find((x) => x.id === g.lottery);
      if (!r || r.error) return false;
      return countHits(g.numbers, [...r.dezenas, ...r.dezenas2].map(Number)).hits >= (MIN_PRIZE[g.lottery] ?? 99);
    });
    if (win) { played.current = true; playCoins(); }
  }, [games, q.data, byConcurso]);

  useEffect(() => { setGames(loadGames()); }, []);

  // Fetch results for games pinned to a specific concurso
  useEffect(() => {
    const missing = games.filter((g) => g.concurso && !byConcurso[`${g.lottery}-${g.concurso}`]);
    if (!missing.length) return;
    missing.forEach((g) => {
      getResultByConcurso({ data: { id: g.lottery, concurso: g.concurso! } })
        .then((r) => setByConcurso((m) => ({ ...m, [`${g.lottery}-${g.concurso}`]: r })))
        .catch(() => {});
    });
  }, [games, byConcurso]);

  const addManual = () => {
    const l = getLottery(lot);
    const parsed = nums.split(/[\s,;.-]+/).filter(Boolean).map(Number);
    const valid = parsed.length === l.pick && parsed.every((n) => Number.isInteger(n) && n >= l.min && n <= l.max) && new Set(parsed).size === parsed.length;
    if (!valid) {
      setAddError(`Digite ${l.pick} números válidos entre ${l.min} e ${l.max}, sem repetir.`);
      return;
    }
    setAddError("");
    const c = Number(conc);
    setGames(saveGames([{ lottery: lot, numbers: parsed.sort((a, b) => a - b), ...(c > 0 ? { concurso: c } : {}) }]));
    setNums("");
    setConc("");
  };

  const onScanned = (text: string) => {
    setScanning(false);
    const p = parseTicketQr(text);
    if (!p.lottery || !p.numbers.length) {
      setScanMsg("Não consegui identificar a aposta nesse QR Code. Tente aproximar mais a câmera ou adicione o jogo manualmente abaixo.");
      setScanned(null);
      return;
    }
    setScanMsg("");
    setScanned(p);
  };

  const confirmScanned = () => {
    if (!scanned?.lottery) return;
    setGames(saveGames([{
      lottery: scanned.lottery,
      numbers: [...scanned.numbers].sort((a, b) => a - b),
      ...(scanned.concurso ? { concurso: scanned.concurso } : {}),
    }]));
    setScanned(null);
  };

  const resultFor = (g: SavedGame): LotteryResult | undefined =>
    g.concurso ? byConcurso[`${g.lottery}-${g.concurso}`] : q.data?.find((r) => r.id === g.lottery);

  return (
    <div className="space-y-3">
      <section className="space-y-2 rounded-2xl border bg-card p-4">
        <h2 className="text-sm font-bold">Adicionar jogo manualmente</h2>
        <select value={lot} onChange={(e) => setLot(e.target.value as LotteryId)} className="h-12 w-full rounded-xl border bg-background px-3 text-sm font-bold">
          {LOTTERIES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <input
          value={nums}
          onChange={(e) => setNums(e.target.value)}
          placeholder={`Números separados por espaço (ex: 01 05 12...)`}
          className="h-12 w-full rounded-xl border bg-background px-3 text-base"
        />
        <div className="flex gap-2">
          <input inputMode="numeric" value={conc} onChange={(e) => setConc(e.target.value.replace(/\D/g, ""))} placeholder="Concurso (opcional)" className="h-12 min-w-0 flex-1 rounded-xl border bg-background px-3 text-base" />
          <button onClick={addManual} className="h-12 rounded-xl bg-primary px-5 font-bold text-primary-foreground">Adicionar</button>
        </div>
        {addError && <p className="text-xs font-bold text-destructive">{addError}</p>}
        <p className="text-[11px] text-muted-foreground">Sem concurso informado, o jogo é conferido contra o último resultado.</p>
      </section>

      <div className="flex items-center justify-between pt-1">
        <h2 className="text-sm font-bold text-muted-foreground">Meus jogos salvos ({games.length})</h2>
        <button onClick={() => { const n = !sound; setSound(n); setSoundEnabled(n); if (n) playCoins(); }} aria-label="Som" className="rounded-full bg-card px-3 py-1 text-xs font-bold">{sound ? "🔊 Som" : "🔇 Mudo"}</button>
        {games.length > 0 && (
          <button onClick={() => { clearGames(); setGames([]); }} className="text-xs font-bold text-destructive">Apagar todos</button>
        )}
      </div>

      {games.length === 0 && (
        <p className="rounded-2xl bg-card p-4 text-center text-sm text-muted-foreground">
          Nenhum jogo salvo. Gere jogos na aba Gerar e toque em "Salvar jogos", ou adicione manualmente acima.
        </p>
      )}

      {games.map((g) => {
        const l = getLottery(g.lottery);
        const r = resultFor(g);
        const drawn = r ? [...r.dezenas.map(Number), ...r.dezenas2.map(Number)] : [];
        const { hits, matched } = drawn.length ? countHits(g.numbers, drawn) : { hits: 0, matched: [] as number[] };
        const matchedSet = new Set(matched);
        return (
          <article key={g.id} className={`shadow-card rounded-2xl bg-card p-4 ${r && !r.error && hits >= (MIN_PRIZE[g.lottery] ?? 99) ? "border-2 border-gold" : "border"}`}>
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold">{l.name}</h3>
                <p className="text-[11px] text-muted-foreground">
                  {g.concurso ? `Concurso ${g.concurso}` : "Último concurso"}
                  {r?.concurso ? ` • conferido com ${r.concurso}` : ""}
                </p>
              </div>
              <button onClick={() => setGames(removeGame(g.id))} aria-label="Apagar jogo" className="rounded-full px-2 py-1 text-xs font-bold text-destructive">✕</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.numbers.map((n, i) => (
                <span
                  key={i}
                  className={`inline-grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${matchedSet.has(n) ? "ball" : "border bg-muted text-muted-foreground"}`}
                >
                  {fmt(n, l.pad)}
                </span>
              ))}
            </div>
            <div className="mt-3 rounded-xl bg-muted p-3 text-sm">
              {!r ? (
                <p className="text-muted-foreground">{q.isLoading ? "Carregando resultado..." : "Resultado indisponível. Toque em atualizar na aba Resultados."}</p>
              ) : r.error ? (
                <p className="text-muted-foreground">{r.error}</p>
              ) : (
                <p>
                  <span className={`font-bold ${hits > 0 ? "text-primary" : ""}`}>{hits} {hits === 1 ? "acerto" : "acertos"}</span>
                  {hits === l.pick ? " 🎉 Parabéns, jogo premiado na faixa principal!" : hits > 0 ? " — números em verde" : " — nenhum número sorteado"}
                </p>
              )}
            </div>
          </article>
        );
      })}
      <p className="text-center text-[11px] text-muted-foreground">Os jogos ficam salvos apenas neste aparelho.</p>
    </div>
  );
}

function NextDraws() {
  const q = useQuery({ ...resultsQuery, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true });
  return (
    <div className="space-y-3">
      <button
        onClick={() => q.refetch()}
        disabled={q.isFetching}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-bold text-primary-foreground disabled:opacity-60"
      >
        <span className={q.isFetching ? "animate-spin" : ""}>🔄</span>
        {q.isFetching ? "Atualizando..." : "Atualizar"}
      </button>
      {q.isLoading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />)}
      {q.isError && <p className="rounded-2xl bg-card p-4 text-center text-sm">Não foi possível carregar. Verifique sua conexão e tente novamente.</p>}
      {q.data?.map((r) => {
        const l = getLottery(r.id as LotteryId);
        return (
          <article key={r.id} className="shadow-card rounded-2xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-bold">{l.name}</h3>
              {r.proximoConcurso && (
                <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-accent-foreground">
                  Concurso {r.proximoConcurso}
                </span>
              )}
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2.5">
                <span className="text-muted-foreground">📅 Data do sorteio</span>
                <b>{r.proximoData ?? "Não informado"}</b>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2.5">
                <span className="text-muted-foreground">💰 Prêmio estimado</span>
                <b className="text-primary">{r.proximoEstimado ? brl(r.proximoEstimado) : "Não informado"}</b>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2.5">
                <span className="text-muted-foreground">🕗 Horário</span>
                <b>20h (Brasília)</b>
              </div>
            </div>
          </article>
        );
      })}
      <p className="text-center text-[11px] text-muted-foreground">Valores estimados pela Caixa. Sorteios às 20h no Espaço da Sorte, em São Paulo.</p>
    </div>
  );
}

function ResultCard({ r }: { r: LotteryResult }) {
  const l = getLottery(r.id as LotteryId);
  const small = r.dezenas.length > 10;
  return (
    <article className="shadow-card rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">{l.name}</h3>
          <p className="text-xs text-muted-foreground">{r.concurso ? `Concurso ${r.concurso} • ${r.data ?? ""}` : "Sem dados"}</p>
        </div>
        {r.concurso && (
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${r.acumulou ? "bg-gold text-gold-foreground" : "bg-accent text-accent-foreground"}`}>
            {r.acumulou ? "ACUMULOU" : "TEVE GANHADOR"}
          </span>
        )}
      </div>
      {r.error ? (
        <p className="text-sm text-muted-foreground">{r.error}. Toque em atualizar.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">{r.dezenas.map((d, i) => <Ball key={i} value={d} small={small} />)}</div>
          {r.dezenas2.length > 0 && (
            <>
              <p className="mt-2 text-[11px] font-bold text-muted-foreground">2º sorteio</p>
              <div className="mt-1 flex flex-wrap gap-1.5">{r.dezenas2.map((d, i) => <Ball key={i} value={d} />)}</div>
            </>
          )}
          {r.extra.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {r.extra.map((e, i) => <span key={i} className="ball-extra rounded-full px-3 py-1 text-xs font-bold">{e}</span>)}
            </div>
          )}
          <div className="mt-3 space-y-1 rounded-xl bg-muted p-3 text-sm">
            <p>
              <span className="font-bold">{r.ganhadores}</span> {r.ganhadores === 1 ? "ganhador" : "ganhadores"} no prêmio principal
              {r.ganhadores > 0 && r.premio ? ` • ${brl(r.premio)} cada` : ""}
            </p>
            {r.ganhadores > 0 && (
              <p className="text-xs text-muted-foreground">
                📍 {r.locais.length ? r.locais.map((x) => `${x.qtd}x ${x.local}`).join(" • ") : "Local não informado"}
              </p>
            )}
            {r.proximoEstimado ? <p className="text-xs text-muted-foreground">Próximo concurso: <b className="text-foreground">{brl(r.proximoEstimado)}</b></p> : null}
          </div>
        </>
      )}
    </article>
  );
}
