const CACHE_NAME = 'tool-center-v1.0.0';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// URLs que NO deben ser cacheadas
const EXCLUDED_URLS = [
  'supabase.co',
  'supabase.com',
  'googleapis.com',
  'gstatic.com'
];

// Instalar Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cache abierto');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[SW] Instalado correctamente');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Error en instalacion:', error);
      })
  );
});

// Activar Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Activado correctamente');
      return self.clients.claim();
    })
  );
});

// Interceptar peticiones de red
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // NO interceptar peticiones a servicios externos críticos
  if (EXCLUDED_URLS.some(excludedUrl => url.href.includes(excludedUrl))) {
    return; // Dejar que la petición pase directamente
  }

  // Solo manejar peticiones GET
  if (request.method !== 'GET') {
    return;
  }

  // Para archivos locales, usar cache first
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request)
        .then((response) => {
          if (response) {
            return response;
          }
          
          return fetch(request).then((response) => {
            // No cachear respuestas con error
            if (!response || response.status !== 200) {
              return response;
            }
            
            // Clonar la respuesta
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
            
            return response;
          });
        })
        .catch((error) => {
          console.error('[SW] Error en fetch:', error);
          // Si es una navegación, devolver index.html del cache
          if (request.destination === 'document') {
            return caches.match('./index.html');
          }
        })
    );
  }
});

// Manejar mensajes del cliente
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
