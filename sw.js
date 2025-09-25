const CACHE_NAME = 'tool-center-v1.1.0';
const DATA_CACHE_NAME = 'tool-center-data-v1.0.0';

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  'https://unpkg.com/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

const dataURLs = [
  'supabase.co',
  '/rest/v1/',
  '/auth/v1/'
];

// Instalar Service Worker
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Instalando v1.1.0...');
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => {
        console.log('📦 Service Worker: Cache estático abierto');
        return cache.addAll(urlsToCache);
      }),
      caches.open(DATA_CACHE_NAME).then((cache) => {
        console.log('📊 Service Worker: Cache de datos abierto');
      })
    ])
    .then(() => {
      console.log('✅ Service Worker: Instalado correctamente');
      return self.skipWaiting();
    })
    .catch((error) => {
      console.error('❌ Service Worker: Error en instalación:', error);
    })
  );
});

// Activar Service Worker
self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker: Activando...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
            console.log('🗑️ Service Worker: Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker: Activado correctamente');
      return self.clients.claim();
    })
  );
});

// Interceptar peticiones de red
self.addEventListener('fetch', (event) => {
  // Solo manejar peticiones GET
  if (event.request.method !== 'GET') {
    return;
  }

  const requestURL = new URL(event.request.url);

  // Estrategia para APIs de Supabase: Network First con fallback a cache
  if (dataURLs.some(url => requestURL.href.includes(url))) {
    event.respondWith(
      caches.open(DATA_CACHE_NAME).then((cache) => {
        return fetch(event.request)
          .then((response) => {
            // Si la respuesta es exitosa, guardarla en cache
            if (response.status === 200) {
              const responseClone = response.clone();
              cache.put(event.request, responseClone);
            }
            return response;
          })
          .catch(() => {
            // Si no hay conexión, buscar en cache
            console.log('🔍 Service Worker: Buscando en cache offline:', event.request.url);
            return cache.match(event.request).then((cachedResponse) => {
              if (cachedResponse) {
                // Notificar que se está usando cache
                self.clients.matchAll().then((clients) => {
                  clients.forEach((client) => {
                    client.postMessage({
                      type: 'CACHE_USED',
                      url: event.request.url,
                      timestamp: new Date().toISOString()
                    });
                  });
                });
                return cachedResponse;
              }
              
              // Si no hay cache, retornar respuesta offline
              return new Response(
                JSON.stringify({
                  error: 'No hay conexión y no hay datos en cache',
                  offline: true,
                  timestamp: new Date().toISOString()
                }),
                {
                  status: 503,
                  statusText: 'Service Unavailable',
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            });
          });
      })
    );
  } else {
    // Cache First para recursos estáticos
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          if (response) {
            return response;
          }
          
          return fetch(event.request).then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
            
            return response;
          });
        })
        .catch(() => {
          // Fallback para navegación
          if (event.request.destination === 'document') {
            return caches.match('./index.html');
          }
          
          // Respuesta genérica para otros recursos
          return new Response('Recurso no disponible offline', {
            status: 404,
            statusText: 'Not Found'
          });
        })
    );
  }
});

// Manejar mensajes del cliente
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(DATA_CACHE_NAME).then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
  
  if (event.data && event.data.type === 'GET_CACHE_STATUS') {
    Promise.all([
      caches.open(CACHE_NAME).then(cache => cache.keys()),
      caches.open(DATA_CACHE_NAME).then(cache => cache.keys())
    ]).then(([staticKeys, dataKeys]) => {
      event.ports[0].postMessage({
        static: staticKeys.length,
        data: dataKeys.length,
        timestamp: new Date().toISOString()
      });
    });
  }
});

// Background Sync para sincronización automática
self.addEventListener('sync', (event) => {
  if (event.tag === 'cotizaciones-sync') {
    console.log('🔄 Service Worker: Ejecutando background sync');
    event.waitUntil(syncDataWithServer());
  }
});

// Función de sincronización en background
async function syncDataWithServer() {
  try {
    // Notificar al cliente principal que ejecute la sincronización
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'BACKGROUND_SYNC',
        timestamp: new Date().toISOString()
      });
    });
    
    return true;
  } catch (error) {
    console.error('❌ Service Worker: Error en background sync:', error);
    return false;
  }
}

// Notificaciones push (para futuras funcionalidades)
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Nueva actualización disponible',
    icon: './manifest.json',
    badge: './manifest.json',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Abrir App',
        icon: './manifest.json'
      },
      {
        action: 'close',
        title: 'Cerrar',
        icon: './manifest.json'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Tool Center', options)
  );
});

// Manejar clicks en notificaciones
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('./')
    );
  }
});

// Monitoreo de conectividad
self.addEventListener('online', () => {
  console.log('🌐 Service Worker: Conexión restaurada');
  // Registrar sync para sincronización automática
  self.registration.sync.register('cotizaciones-sync');
});

self.addEventListener('offline', () => {
  console.log('📱 Service Worker: Modo offline activado');
});
