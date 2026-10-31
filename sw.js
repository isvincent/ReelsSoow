/* 教學影片集 — Service Worker（離線可開啟網站外殼） */
const VERSION = 'reels-v3';
const SHELL = [
  './', 'index.html', 'css/style.css',
  'js/config.js', 'js/i18n.js', 'js/sound.js', 'js/app.js',
  'videos.json', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 只處理本站檔案；雲端硬碟影片、縮圖與 Apps Script API 直接連網
  if (url.origin !== location.origin) return;

  // 網路優先（拿到最新版，並略過瀏覽器 HTTP 快取），失敗時用快取
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
