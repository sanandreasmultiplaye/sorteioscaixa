import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const IDS = ["megasena", "lotofacil", "quina", "lotomania", "timemania", "duplasena", "diadesorte", "supersete", "maismilionaria"] as const;
const endpoint = z.string().url().max(1000).startsWith("https://");

export const savePushSubscription = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ endpoint, lotteries: z.array(z.enum(IDS)).max(9), reminders: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("push_subscriptions").upsert({ ...data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ endpoint }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", data.endpoint);
    return { ok: true };
  });

export const sendTestPush = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ endpoint }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin.from("push_subscriptions").select("endpoint").eq("endpoint", data.endpoint).maybeSingle();
    if (!sub) throw new Error("Aparelho não cadastrado");
    const { deliver } = await import("./push.server");
    await deliver([{ endpoint: data.endpoint, title: "🔔 Notificações ativadas!", body: "Você será avisado quando saírem os resultados das loterias escolhidas.", url: "/?tab=resultados" }]);
    return { ok: true };
  });
