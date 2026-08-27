/* Pit Call — Web Push handlers.
   Imported by the generated Workbox service worker (workbox.importScripts).
   This file only handles messaging (push / notificationclick / badge); it never
   caches app assets — that stays the generated worker's job. */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Pit Call", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Pit Call";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    timestamp: Date.now(),
    data: { url: data.url || "/dashboard/notifications", env: data.env || "live" },
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      if (typeof data.unread === "number" && "setAppBadge" in self.navigator) {
        try {
          if (data.unread > 0) await self.navigator.setAppBadge(data.unread);
          else await self.navigator.clearAppBadge();
        } catch {
          /* badge unsupported — progressive enhancement */
        }
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard/notifications";
  const absolute = new URL(target, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        client.postMessage({ type: "PITCALL_NAVIGATE", url: target });
        return;
      }
      await self.clients.openWindow(absolute);
    })(),
  );
});

self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || msg.type !== "PITCALL_SET_BADGE") return;
  const count = Number(msg.count) || 0;
  try {
    if (count > 0) self.navigator.setAppBadge?.(count);
    else self.navigator.clearAppBadge?.();
  } catch {
    /* unsupported */
  }
});
