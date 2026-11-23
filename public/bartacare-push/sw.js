self.addEventListener('push', event => {
  event.waitUntil(self.registration.showNotification('BartaCare', {
    body: 'নতুন মেসেজ এসেছে', tag: 'bartacare-inbox'
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/?inbox=1&workspace='+encodeURIComponent(new URL(self.registration.scope).pathname.split('/')[2])));
});
