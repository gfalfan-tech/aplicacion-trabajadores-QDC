// Service worker de Portal QDC: solo se encarga de mostrar las
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
    payload = { titulo: 'Portal QDC', cuerpo: event.data.text() };
  }

  const titulo = payload.titulo || 'Portal QDC';
  const opciones = {
    body: payload.cuerpo || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: payload.url || '/' },
    tag: payload.tag || undefined,
  };

  event.waitUntil(self.registration.showNotification(titulo, opciones));
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
