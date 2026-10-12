import type { LotteryId } from "./lotteries";
import { savePushSubscription, removePushSubscription, sendTestPush } from "./push.functions";

const VAPID_PUBLIC = "BPzZLslzHZog78PL08Xws-eUzDLLQorKhl2ie_nbrSGMTsEdZX00JC9Z2Y6IT1W7500Rc3U50EVQGxuknr1p0To";
const PREFS = "push-prefs";
export const ASKED = "push-asked";

export interface PushPrefs { lotteries: LotteryId[]; reminders: boolean }

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export function loadPrefs(): PushPrefs {
  try { return { lotteries: ["megasena", "lotofacil"], reminders: true, ...JSON.parse(localStorage.getItem(PREFS) || "{}") }; }
  catch { return { lotteries: ["megasena", "lotofacil"], reminders: true }; }
}

function keyBytes(b64: string) {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js");
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Asks permission (if needed), subscribes this device and saves the chosen lotteries. */
export async function enablePush(prefs: PushPrefs, test = false) {
  if (!pushSupported()) throw new Error("Este navegador não suporta notificações. No iPhone, instale o app na tela inicial primeiro.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permissão negada. Libere as notificações nas configurações do navegador.");
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }));
  localStorage.setItem(PREFS, JSON.stringify(prefs));
  await savePushSubscription({ data: { endpoint: sub.endpoint, ...prefs } });
  if (test) await sendTestPush({ data: { endpoint: sub.endpoint } });
}

export async function updatePrefs(prefs: PushPrefs) {
  localStorage.setItem(PREFS, JSON.stringify(prefs));
  const sub = await currentSubscription();
  if (sub) await savePushSubscription({ data: { endpoint: sub.endpoint, ...prefs } });
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) {
    await removePushSubscription({ data: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  }
}
