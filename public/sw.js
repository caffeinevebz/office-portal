// Minimal service worker for Ledgify.
//
// Its job is device notifications: mobile browsers (and installed PWAs) only
// allow notifications to be shown through a service worker registration, so
// the app calls registration.showNotification() instead of new Notification().
// Clicking one focuses the app (or opens it) at the notification's link.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client && href) client.navigate(href).catch(() => {});
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(href);
    }),
  );
});
