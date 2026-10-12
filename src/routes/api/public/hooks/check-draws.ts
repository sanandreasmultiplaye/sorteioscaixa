import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { fetchAllLatest } from "@/lib/results.functions";
import { getLottery, type LotteryId } from "@/lib/lotteries";
import { deliver } from "@/lib/push.server";

const brl = (v: number | null) => v == null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// Scheduled: detects newly published draws and same-day betting deadlines, then notifies subscribed devices.
export const Route = createFileRoute("/api/public/hooks/check-draws")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const brt = new Date(Date.now() - 3 * 3600_000);
        const iso = brt.toISOString().slice(0, 10);
        const today = `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
        const hour = brt.getUTCHours();

        const [results, { data: states }, { data: subs }] = await Promise.all([
          fetchAllLatest(),
          supabaseAdmin.from("lottery_state").select("*"),
          supabaseAdmin.from("push_subscriptions").select("endpoint,lotteries,reminders"),
        ]);
        const stateMap = new Map((states ?? []).map((s) => [s.id, s]));
        const out: { endpoint: string; title: string; body: string; url: string }[] = [];
        const updates: { id: string; last_concurso: number | null; last_reminder: string | null; updated_at: string }[] = [];

        for (const r of results) {
          if (!r.concurso || r.error) continue;
          const name = getLottery(r.id as LotteryId).name;
          const st = stateMap.get(r.id);
          let last = st?.last_concurso ?? null;
          let lastRem = st?.last_reminder ?? null;
          let changed = !st;

          if (last != null && r.concurso > last) {
            for (const s of subs ?? []) if (s.lotteries.includes(r.id)) out.push({
              endpoint: s.endpoint,
              title: `${name}: Concurso ${r.concurso} publicado!`,
              body: "Novos números sorteados. Toque para conferir seus jogos salvos.",
              url: "/?tab=conferir",
            });
          }
          if (last == null || r.concurso > last) { last = r.concurso; changed = true; }

          if (hour >= 15 && hour < 19 && r.proximoData === today && lastRem !== iso) {
            const h = 19 - hour;
            for (const s of subs ?? []) if (s.reminders && s.lotteries.includes(r.id)) out.push({
              endpoint: s.endpoint,
              title: `⏰ ${name}: sorteio hoje!`,
              body: `${r.proximoEstimado ? `Prêmio estimado ${brl(r.proximoEstimado)}. ` : ""}Faltam cerca de ${h}h para encerrar as apostas (19h).`,
              url: `/?tab=gerar&lot=${r.id}`,
            });
            lastRem = iso; changed = true;
          }
          if (changed) updates.push({ id: r.id, last_concurso: last, last_reminder: lastRem, updated_at: new Date().toISOString() });
        }

        if (updates.length) await supabaseAdmin.from("lottery_state").upsert(updates);
        const devices = await deliver(out);
        return Response.json({ ok: true, messages: out.length, devices });
      },
    },
  },
});
