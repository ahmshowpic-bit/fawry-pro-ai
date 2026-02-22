// =====================================================================
// Ahmed PRO - Service Worker  |  استراتيجية: Cache-First / Offline-First
// =====================================================================

const CACHE_NAME = 'ahmed-pro-v3';

// الملفات الأساسية التي تُخزَّن فور التثبيت (Shell)
const SHELL_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon.png',
    './tailwind.js',
    './sweetalert2.js',
    './firebase-app.js',
    './firebase-database.js',
    './firebase-auth.js'
];

// نطاقات Firebase - تُعامَل بـ Network-First لجلب البيانات الحية
const FIREBASE_HOSTS = [
    'firebaseio.com',
    'firebase.google.com',
    'googleapis.com',
    'identitytoolkit.googleapis.com'
];

// ─── INSTALL ──────────────────────────────────────────────────────────
// يُخزّن جميع ملفات الـ Shell دفعة واحدة عند التثبيت
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
    );
    self.skipWaiting(); // تفعيل الـ SW الجديد فوراً دون انتظار إغلاق التبويبات
});

// ─── ACTIVATE ─────────────────────────────────────────────────────────
// يحذف الكاشات القديمة عند تفعيل نسخة جديدة
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k !== CACHE_NAME)
                    .map(k => caches.delete(k))
            )
        )
    );
    self.clients.claim(); // يسيطر على جميع الصفحات المفتوحة فوراً
});

// ─── FETCH ────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // تجاهل طلبات غير GET (POST لـ Firebase مثلاً)
    if (event.request.method !== 'GET') return;

    // ── Firebase / البيانات الحية → Network-First ──────────────────────
    // نحاول الشبكة أولاً لجلب أحدث البيانات؛ عند الفشل نرد من الكاش
    if (FIREBASE_HOSTS.some(h => url.hostname.includes(h))) {
        event.respondWith(networkFirstStrategy(event.request));
        return;
    }

    // ── الخطوط والـ CDN → Cache-First مع تخزين ديناميكي ────────────────
    if (url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com') ||
        url.hostname.includes('cdnjs.cloudflare.com') ||
        url.hostname.includes('font-awesome')) {
        event.respondWith(cacheFirstWithFallback(event.request));
        return;
    }

    // ── بقية الموارد المحلية → Cache-First ──────────────────────────────
    event.respondWith(cacheFirstWithFallback(event.request));
});

// ─── استراتيجية: Cache-First مع Fallback للشبكة ──────────────────────
async function cacheFirstWithFallback(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const networkResponse = await fetch(request);
        // نخزّن الاستجابة الناجحة في الكاش ديناميكياً
        if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch {
        // إذا فشلت الشبكة وليس في الكاش → نرد بصفحة index.html كـ fallback
        const fallback = await caches.match('./index.html');
        return fallback || new Response('غير متاح بدون إنترنت', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

// ─── استراتيجية: Network-First مع Fallback للكاش ─────────────────────
async function networkFirstStrategy(request) {
    try {
        const networkResponse = await fetch(request);
        // نخزّن استجابة Firebase في الكاش للاستخدام الأوف لاين
        if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch {
        // الشبكة فشلت → نرد من الكاش إن وُجد
        const cached = await caches.match(request);
        return cached || new Response(JSON.stringify({ error: 'offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
