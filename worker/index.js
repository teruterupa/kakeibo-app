self.addEventListener("push", (event) => {
  let payload = { title: "家計簿", body: "", url: "/transactions" };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : "/transactions";

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) {
          await client.focus();
          return;
        }
      }

      // WindowClient.navigate()での既存タブ再利用はSafari/WebKitで挙動が
      // 不安定なため使わず、常に新しいナビゲーションを行うopenWindow()に
      // 統一する（既存タブが1つしか持てないスタンドアロンPWAでは、
      // ブラウザ側がそのタブへのナビゲーションとして扱う）。
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
        return;
      }

      const fallbackClient = windowClients.find((client) => "focus" in client);
      if (fallbackClient) {
        await fallbackClient.focus();
      }
    })()
  );
});
