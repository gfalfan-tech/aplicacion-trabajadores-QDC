// Service worker de Gestión RRHH: solo se encarga de mostrar las
// notificaciones push que llegan y de llevar a la persona a la pantalla
// correcta al tocarlas. No cachea nada (no es para funcionar sin conexión).

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { titulo: 'Gestión RRHH', cuerpo: event.data.text() };
  }

  const titulo = payload.titulo || 'Gestión RRHH';
  const opciones = {
    body: payload.cuerpo || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: payload.url || '/' },
    tag: payload.tag || undefined,
  };

  // Además de mostrar la notificación, si el servidor mandó cuántas
  // notificaciones sin leer tiene la persona, se refleja ese número en el
  // "badge" del ícono de la app (funciona incluso con la app cerrada). Si
  // el navegador no soporta la Badging API, esto simplemente no hace nada.
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(titulo, opciones);
      if (typeof payload.badgeCount === 'number' && 'setAppBadge' in self.navigator) {
        try {
          if (payload.badgeCount > 0) {
            await self.navigator.setAppBadge(payload.badgeCount);
          } else {
            await self.navigator.clearAppBadge();
          }
        } catch (e) {
          // silencioso
        }
      }
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clientList.length > 0 && 'focus' in clientList[0]) {
        clientList[0].navigate(url);
        return clientList[0].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
