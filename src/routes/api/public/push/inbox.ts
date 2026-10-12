import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Called by the service worker after a wake-up push: returns and clears this device's pending messages.
export const Route = createFileRoute("/api/public/push/inbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = z.object({ endpoint: z.string().url().max(1000) }).safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ messages: [] }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.from("push_inbox").select("id,title,body,url").eq("endpoint", parsed.data.endpoint).order("id").limit(20);
        const ids = (data ?? []).map((m) => m.id);
        if (ids.length) await supabaseAdmin.from("push_inbox").delete().in("id", ids);
        return Response.json({ messages: data ?? [] });
      },
    },
  },
});
