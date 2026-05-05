self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const { title, body, url } = data;

    const options = {
      body: body || 'New message',
      icon: '/icon.png',
      badge: '/badge.png',
      data: { url: url || '/' },
      requireInteraction: false,
      tag: 'darwinbox-notification',
      vibrate: [200, 100, 200]
    };

    event.waitUntil(
      self.registration.showNotification(title || 'Darwinbox Connect', options)
    );
  } catch (error) {
    console.error('Push event error:', error);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';
  const fullUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url === fullUrl && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise, open a new window
        if (clients.openWindow) {
          return clients.openWindow(fullUrl);
        }
      })
  );
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
