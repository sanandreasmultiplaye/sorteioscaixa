// Notification-only worker: receives push wake-ups and shows the pending messages. No caching.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let messages = [];
    try {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        const r = await fetch("/api/public/push/inbox", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        messages = (await r.json()).messages || [];
      }
    } catch (e) {}
    if (!messages.length) messages = [{ id: "x", title: "Loterias Caixa", body: "Novos resultados disponíveis. Toque para conferir.", url: "/?tab=resultados" }];
    for (const m of messages) {
      await self.registration.showNotification(m.title, {
        body: m.body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "loteria-" + m.id,
        data: { url: m.url },
        vibrate: [200, 100, 200],
      });
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { await c.navigate(url).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
