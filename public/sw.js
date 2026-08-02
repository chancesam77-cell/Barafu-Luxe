// Barafu Luxe — Service Worker
// Handles offline caching (existing behavior) plus Web Push notifications.

const CACHE = 'bl-v11';

// ── APP ICON BADGE COUNTER ──
// Service workers don't share memory between wake-ups and can't see
// localStorage, so the running unread count needs its own small persistent
// store. IndexedDB is the standard tool available here.
function getBadgeCount(){
  return new Promise(function(resolve){
    var req = indexedDB.open('bl-badge-db', 1);
    req.onupgradeneeded = function(e){ e.target.result.createObjectStore('badge'); };
    req.onsuccess = function(e){
      var db = e.target.result;
      var tx = db.transaction('badge', 'readonly');
      var getReq = tx.objectStore('badge').get('count');
      getReq.onsuccess = function(){ resolve(getReq.result || 0); };
      getReq.onerror = function(){ resolve(0); };
    };
    req.onerror = function(){ resolve(0); };
  });
}

function setBadgeCount(count){
  return new Promise(function(resolve){
    var req = indexedDB.open('bl-badge-db', 1);
    req.onupgradeneeded = function(e){ e.target.result.createObjectStore('badge'); };
    req.onsuccess = function(e){
      var db = e.target.result;
      var tx = db.transaction('badge', 'readwrite');
      tx.objectStore('badge').put(count, 'count');
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ resolve(); };
    };
    req.onerror = function(){ resolve(); };
  });
}

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

  // Showing the actual notification is the one thing that must never fail
  // to happen — everything else (badge count) is a secondary enhancement
  // that runs independently and is not allowed to block or break it, even
  // if IndexedDB or the Badging API misbehave on a given device.
  var showNotificationPromise = self.registration.showNotification(title, options);

  var updateBadgePromise = getBadgeCount().then(function(current){
    var next = current + 1;
    return setBadgeCount(next).then(function(){
      if(self.navigator && 'setAppBadge' in self.navigator){
        return self.navigator.setAppBadge(next);
      }
    });
  }).catch(function(err){
    console.log('Badge update failed (notification still shown regardless):', err);
  });

  e.waitUntil(Promise.all([showNotificationPromise, updateBadgePromise]));
});

// The main app tells us to reset once someone's actually opened it and seen
// what's new — keeps the OS icon badge and the in-app bell badge in sync
// rather than tracking two independent, possibly-conflicting counts.
self.addEventListener('message', function(e){
  if(e.data && e.data.type === 'resetBadge'){
    e.waitUntil(
      setBadgeCount(0).then(function(){
        if(self.navigator && 'clearAppBadge' in self.navigator) return self.navigator.clearAppBadge();
      })
    );
  }
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
