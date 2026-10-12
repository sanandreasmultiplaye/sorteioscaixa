// Server-only Web Push helpers (payload-less push signed with VAPID).
export const VAPID_PUBLIC = "BPzZLslzHZog78PL08Xws-eUzDLLQorKhl2ie_nbrSGMTsEdZX00JC9Z2Y6IT1W7500Rc3U50EVQGxuknr1p0To";
const X = "_NkuyXMdmiDvw8vTxfCz55TMMstCisqGXaJ7-dutIYw";
const Y = "TsEdZX00JC9Z2Y6IT1W7500Rc3U50EVQGxuknr1p0To";

const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

let keyPromise: Promise<CryptoKey> | null = null;
function getKey() {
  keyPromise ??= crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: X, y: Y, d: process.env['VAPID_D']!, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return keyPromise;
}

async function vapidJwt(aud: string) {
  const enc = new TextEncoder();
  const header = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:contato@sorteioscaixa.app" })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await getKey(), enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64u(sig)}`;
}

/** Sends an empty "wake up" push. Returns false when the subscription is gone. */
export async function sendPush(endpoint: string): Promise<boolean> {
  const aud = new URL(endpoint).origin;
  const jwt = await vapidJwt(aud);
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC}`, TTL: "86400", Urgency: "high", "Content-Length": "0" },
  });
  if (r.status === 404 || r.status === 410) return false;
  if (!r.ok) console.error("push failed", r.status, await r.text().catch(() => ""));
  return true;
}

/** Queues messages per endpoint and wakes each device. */
export async function deliver(items: { endpoint: string; title: string; body: string; url: string }[]) {
  if (!items.length) return 0;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("push_inbox").insert(items);
  const endpoints = [...new Set(items.map((i) => i.endpoint))];
  await Promise.all(endpoints.map(async (e) => {
    try {
      if (!(await sendPush(e))) await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", e);
    } catch (err) { console.error("push error", err); }
  }));
  return endpoints.length;
}
