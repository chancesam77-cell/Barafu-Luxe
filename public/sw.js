// Barafu Luxe — Service Worker
// Handles offline caching (existing behavior) plus Web Push notifications.

const CACHE = 'bl-v7';

self.addEventListener('install', function(e){
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE; })
            .map(function(k){ return caches.delete(k); })
      );
    }).then(function(){ return self.clients.claim(); })
  );
});

// Network-first: always try to get the latest version first. Only fall
// back to the cached copy if the network request fails (offline). This
// matters a lot during active development — a cache-first strategy would
// mean every update gets silently hidden behind the old cached copy,
// invisible to anyone who already has the app installed.
self.addEventListener('fetch', function(e){
  e.respondWith(
    fetch(e.request).then(function(response){
      var copy = response.clone();
      caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
      return response;
    }).catch(function(){
      return caches.match(e.request);
    })
  );
});

// ── PUSH NOTIFICATIONS ──
self.addEventListener('push', function(e){
  var data = {};
  try{ data = e.data ? e.data.json() : {}; }catch(err){ data = { title: 'Barafu Luxe', body: e.data ? e.data.text() : '' }; }

  var title = data.title || 'Barafu Luxe';
  var options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    data: { url: data.url || '/' },
    tag: data.tag || undefined,
    renotify: !!data.tag
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/';

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList){
      for (var i = 0; i < clientList.length; i++){
        var client = clientList[i];
        if ('focus' in client){
          client.focus();
          if ('navigate' in client) client.navigate(url);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
