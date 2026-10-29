/* =========================================================
 * 教學影片集 — 主程式
 * ========================================================= */
(function () {
  'use strict';

  const CFG = window.SITE_CONFIG || {};
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const root = document.documentElement;

  /* ---------- 安全的本機儲存 ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('reels.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('reels.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };

  /* ---------- 狀態 ---------- */
  const DEFAULTS = { fullscreen: 'off', sound: 'on', device: 'auto', layout: 'auto', lang: 'zh', font: 'normal', theme: 'system' };
  const settings = Object.assign({}, DEFAULTS, store.get('settings', {}));
  settings.fullscreen = document.fullscreenElement ? 'on' : 'off';
  const favs = new Set(store.get('favs', []));
  const seen = new Set(store.get('seen', []));
  let videos = [];
  let shown = [];
  let current = -1;
  let filter = 'all';
  let query = '';
  let sort = store.get('sort', 'new');
  let view = store.get('view', 'grid');
  let seenTimer = null;

  const T = () => window.I18N[settings.lang] || window.I18N.zh;
  const t = (k) => { const v = T()[k]; return v == null ? (window.I18N.zh[k] || k) : v; };

  /* ---------- 工具 ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function highlight(text, q) {
    const safe = esc(text);
    if (!q) return safe;
    const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    return safe.replace(re, '<mark>$1</mark>');
  }
  function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(t('dateFmt'), { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  function fmtSize(b) {
    if (!b) return '';
    return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
  }
  function isNew(v) { return (Date.now() - new Date(v.date).getTime()) < (CFG.NEW_DAYS || 7) * 864e5; }

  // 系列名稱：子資料夾分類優先；否則去掉檔名結尾的「_A / -2 / 1」等編號
  function seriesOf(v) {
    if (v.category) return v.category;
    let s = v.title.replace(/[\s_\-－（(]+([A-Za-z]|\d+)[)）]?$/, '');
    if (s === v.title) s = v.title.replace(/(\D)\d+$/, '$1');
    return s.trim() || v.title;
  }
  function hashStr(s) { let h = 0; for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0; return h; }
  function styleOf(v) {
    const text = v.title + ' ' + (v.category || '');
    const hit = (CFG.TOPIC_STYLES || []).find(s => text.toLowerCase().includes(s.key.toLowerCase()));
    if (hit) return hit;
    const h = hashStr(seriesOf(v));
    const C = CFG.FALLBACK_COLORS || [['#ec4899', '#8b5cf6']];
    const I = CFG.FALLBACK_ICONS || ['🎬'];
    return { icon: I[h % I.length], colors: C[h % C.length] };
  }
  const thumbUrl = id => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w480`;
  const previewUrl = id => `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
  const viewUrl = id => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  /* ---------- 資料載入 ---------- */
  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = '__reels_cb_' + Date.now();
      const s = document.createElement('script');
      const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 15000);
      function cleanup() { clearTimeout(timer); delete window[cb]; s.remove(); }
      window[cb] = data => { cleanup(); resolve(data); };
      s.onerror = () => { cleanup(); reject(new Error('jsonp error')); };
      s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
      document.head.appendChild(s);
    });
  }
  async function fetchJson(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  async function loadData(force) {
    let data = null, source = 'json';
    const api = (CFG.API_URL || '').trim();
    if (api) {
      // 每次都略過 Apps Script 快取，並加時間戳避免瀏覽器／CDN 用舊資料
      const url = api + (api.includes('?') ? '&' : '?') + 'nocache=1&t=' + Date.now();
      try { data = await fetchJson(url); source = 'api'; }
      catch (e) { try { data = await jsonp(url); source = 'api'; } catch (e2) { /* 改用備用 */ } }
    }
    if (!data) {
      try { data = await fetchJson('videos.json'); source = 'json'; if (api) toast(t('loadFail')); }
      catch (e) { data = store.get('cache', null); source = 'cache'; }
    }
    if (data && Array.isArray(data.videos)) store.set('cache', data);
    return { list: (data && data.videos) || [], source };
  }

  /* ---------- 設定 ---------- */
  function applySettings(changed) {
    root.dataset.theme = settings.theme;
    root.dataset.font = settings.font;
    root.dataset.device = settings.device;
    root.dataset.layout = settings.layout;
    root.lang = settings.lang === 'en' ? 'en' : 'zh-Hant';
    SFX.set(settings.sound === 'on');

    $$('[data-setting]').forEach(g => {
      const key = g.dataset.setting;
      $$('button', g).forEach(b => b.classList.toggle('active', b.dataset.val === settings[key]));
    });

    const meta = document.querySelector('meta[name="theme-color"]');
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    meta.setAttribute('content', dark ? '#120c24' : '#7c3aed');

    const save = Object.assign({}, settings); delete save.fullscreen;
    store.set('settings', save);
    if (changed === 'lang') { applyI18n(); render(); }
    if (changed === 'device' || changed === 'layout') render();
  }

  function applyI18n() {
    $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    $$('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', t(el.dataset.i18nTitle)); });
    document.title = t('siteTitle');
    updateFavPill();
  }

  async function setFullscreen(on) {
    try {
      if (on && !document.fullscreenElement) await root.requestFullscreen();
      if (!on && document.fullscreenElement) await document.exitFullscreen();
    } catch (e) { toast(t('fsFail')); }
  }
  document.addEventListener('fullscreenchange', () => {
    settings.fullscreen = document.fullscreenElement ? 'on' : 'off';
    applySettings();
  });

  function initSettingsUI() {
    $$('[data-setting]').forEach(g => {
      g.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        const key = g.dataset.setting, val = b.dataset.val;
        if (key === 'fullscreen') { setFullscreen(val === 'on'); SFX.play('toggle'); return; }
        settings[key] = val;
        if (key === 'sound' && val === 'on') SFX.set(true);
        SFX.play('toggle');
        applySettings(key);
      });
    });
    $('#btnSettings').addEventListener('click', () => { SFX.play('open'); $('#settings').hidden = false; });
    $$('[data-close-settings]').forEach(el => el.addEventListener('click', closeSettings));
    $('#btnResetSettings').addEventListener('click', () => {
      Object.assign(settings, DEFAULTS); setFullscreen(false);
      applySettings('lang'); toast(t('resetDone')); SFX.play('swipe');
    });
    $('#btnClearProgress').addEventListener('click', () => {
      seen.clear(); store.set('seen', []); render(); toast(t('cleared')); SFX.play('swipe');
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applySettings());
  }
  function closeSettings() { $('#settings').hidden = true; SFX.play('close'); }

  /* ---------- 篩選與排序 ---------- */
  function filtered() {
    const q = query.trim().toLowerCase();
    let list = videos.filter(v => {
      if (filter === 'favs' && !favs.has(v.id)) return false;
      if (filter === 'new' && !isNew(v)) return false;
      if (filter === 'unseen' && seen.has(v.id)) return false;
      if (filter.startsWith('s:') && seriesOf(v) !== filter.slice(2)) return false;
      if (q && !(v.title + ' ' + (v.category || '') + ' ' + (v.description || '')).toLowerCase().includes(q)) return false;
      return true;
    });
    const by = {
      new: (a, b) => b.date.localeCompare(a.date),
      old: (a, b) => a.date.localeCompare(b.date),
      az: (a, b) => a.title.localeCompare(b.title, 'zh-Hant', { numeric: true }),
      size: (a, b) => (b.size || 0) - (a.size || 0)
    };
    return list.sort(by[sort] || by.new);
  }

  /* ---------- 繪製 ---------- */
  function renderChips() {
    const series = {};
    videos.forEach(v => { const s = seriesOf(v); series[s] = (series[s] || 0) + 1; });
    const newCount = videos.filter(isNew).length;
    const chips = [
      { id: 'all', label: '🌈 ' + t('all'), n: videos.length, color: '#7c3aed' },
      { id: 'favs', label: '❤️ ' + t('favs'), n: favs.size, color: '#ec4899' },
      { id: 'unseen', label: '👀 ' + t('unseen'), n: videos.filter(v => !seen.has(v.id)).length, color: '#0ea5e9' }
    ];
    if (newCount) chips.splice(1, 0, { id: 'new', label: '🆕 ' + t('news'), n: newCount, color: '#f97316' });
    Object.keys(series).sort((a, b) => a.localeCompare(b, 'zh-Hant')).forEach(s => {
      const st = styleOf(videos.find(v => seriesOf(v) === s));
      chips.push({ id: 's:' + s, label: st.icon + ' ' + s, n: series[s], color: st.colors[0] });
    });
    $('#chips').innerHTML = chips.map(c =>
      `<button class="chip${filter === c.id ? ' active' : ''}" role="tab" aria-selected="${filter === c.id}" data-filter="${esc(c.id)}" style="--chip:${c.color}">${esc(c.label)}<small>${c.n}</small></button>`
    ).join('');
    $('#statSeries').textContent = Object.keys(series).length;
  }

  function cardHtml(v, i) {
    const st = styleOf(v);
    const badges = [];
    if (isNew(v)) badges.push('<span class="badge new">NEW</span>');
    if (seen.has(v.id)) badges.push('<span class="badge seen">✓</span>');
    const meta = [ '📅 ' + fmtDate(v.date) ];
    if (v.category) meta.push('📁 ' + esc(v.category));
    return `
      <article class="card" tabindex="0" role="button" data-i="${i}" style="--i:${Math.min(i, 20)}" aria-label="${esc(v.title)}">
        <div class="thumb" style="--c1:${st.colors[0]};--c2:${st.colors[1]}">
          <img loading="lazy" alt="" referrerpolicy="no-referrer" data-src="${thumbUrl(v.id)}">
          <span class="thumb-icon">${esc(st.icon)}</span>
          <span class="thumb-title">${esc(v.title)}</span>
          <span class="play" aria-hidden="true">▶</span>
          <div class="badges">${badges.join('')}</div>
        </div>
        <button class="fav-btn${favs.has(v.id) ? ' on' : ''}" data-fav="${esc(v.id)}" aria-label="${t('fav')}">${favs.has(v.id) ? '❤️' : '🤍'}</button>
        <div class="card-body">
          <h3 class="card-title">${highlight(v.title, query.trim())}</h3>
          <p class="card-meta">${meta.join('<span>·</span>')}</p>
        </div>
      </article>`;
  }

  function render() {
    shown = filtered();
    const grid = $('#grid');
    grid.classList.toggle('list', view === 'list');
    grid.innerHTML = shown.map(cardHtml).join('');
    $$('img[data-src]', grid).forEach(img => {
      img.onload = () => { if (img.naturalWidth > 16) img.classList.add('ok'); };
      img.onerror = () => img.remove();
      img.src = img.dataset.src;
    });
    $('#emptyState').hidden = shown.length > 0 || !$('#loading').hidden;
    const q = query.trim();
    $('#resultInfo').textContent = !videos.length ? '' : q ? T().resultQ(shown.length, q) : T().result(shown.length, videos.length);
    $$('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $('#sortSelect').value = sort;
    renderChips();
    renderStats();
  }

  function renderStats() {
    $('#statTotal').textContent = videos.length;
    const latest = videos.reduce((m, v) => (!m || v.date > m ? v.date : m), '');
    $('#statLatest').textContent = latest ? fmtDate(latest).replace(/^\d{4}\D/, '') : '—';
    const n = videos.filter(v => seen.has(v.id)).length;
    $('#progressText').textContent = `${n} / ${videos.length}`;
    $('#progressFill').style.width = videos.length ? (n / videos.length * 100) + '%' : '0';
    $('#progressMsg').textContent = videos.length ? T().progressMsg(n, videos.length) : t('noVideo');
  }

  /* ---------- 收藏 ---------- */
  function toggleFav(id, srcEl) {
    if (favs.has(id)) { favs.delete(id); SFX.play('unfav'); toast(t('favDel')); }
    else {
      favs.add(id); SFX.play('fav'); toast(t('favAdd'));
      if (srcEl) { const r = srcEl.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, ['❤️', '💖', '✨']); }
    }
    store.set('favs', Array.from(favs));
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach(b => { b.classList.toggle('on', favs.has(id)); b.textContent = favs.has(id) ? '❤️' : '🤍'; });
    updateFavPill();
    renderChips();
    if (filter === 'favs') render();
  }
  function updateFavPill() {
    const v = shown[current]; const b = $('#btnFav');
    if (!b) return;
    const on = v && favs.has(v.id);
    b.classList.toggle('on', !!on);
    b.innerHTML = (on ? '❤️ ' : '🤍 ') + `<span>${t(on ? 'faved' : 'fav')}</span>`;
  }

  /* ---------- 播放器 ---------- */
  function openPlayer(i, silent) {
    if (i < 0 || i >= shown.length) return;
    current = i;
    const v = shown[i];
    const st = styleOf(v);
    const frame = $('#playerFrame');
    frame.innerHTML = '<div class="frame-loading"><div class="loader"><i></i><i></i><i></i></div></div>';
    const ifr = document.createElement('iframe');
    ifr.src = previewUrl(v.id);
    ifr.allow = 'autoplay; fullscreen; picture-in-picture';
    ifr.allowFullscreen = true;
    ifr.title = v.title;
    ifr.onload = () => { const l = $('.frame-loading', frame); if (l) l.remove(); };
    frame.appendChild(ifr);

    const badge = $('#playerIcon');
    badge.textContent = st.icon;
    badge.style.setProperty('--c1', st.colors[0]); badge.style.setProperty('--c2', st.colors[1]);
    $('#playerTitle').textContent = v.title;
    $('#playerMeta').textContent = ['📅 ' + fmtDate(v.date), v.size ? '💾 ' + fmtSize(v.size) : '', v.category ? '📁 ' + v.category : '', `🎞️ ${i + 1} / ${shown.length}`].filter(Boolean).join('　');
    $('#playerDesc').textContent = v.description || '';
    $('#btnDrive').href = viewUrl(v.id);
    $('#btnPrev').disabled = shown.length < 2;
    $('#btnNext').disabled = shown.length < 2;
    updateFavPill();

    const modal = $('#player');
    if (modal.hidden) { modal.hidden = false; document.body.style.overflow = 'hidden'; }
    if (!silent) SFX.play('open');
    history.replaceState(null, '', '#v=' + v.id);

    clearTimeout(seenTimer);
    seenTimer = setTimeout(() => markSeen(v.id), 4000);
  }
  function markSeen(id) {
    if (seen.has(id)) return;
    seen.add(id); store.set('seen', Array.from(seen));
    const card = $(`.card[data-i="${shown.findIndex(v => v.id === id)}"] .badges`);
    if (card && !$('.seen', card)) card.insertAdjacentHTML('beforeend', '<span class="badge seen">✓</span>');
    renderStats(); renderChips();
    if (videos.length && videos.every(v => seen.has(v.id))) {
      SFX.play('win'); toast(t('allDone')); confetti();
    }
  }
  function closePlayer() {
    const modal = $('#player');
    if (modal.hidden) return;
    clearTimeout(seenTimer);
    modal.hidden = true;
    $('#playerFrame').innerHTML = '';
    document.body.style.overflow = '';
    history.replaceState(null, '', location.pathname + location.search);
    SFX.play('close');
    const card = $(`.card[data-i="${current}"]`); if (card) card.focus({ preventScroll: true });
  }
  function step(d) {
    if (shown.length < 2) return;
    SFX.play('swipe');
    openPlayer((current + d + shown.length) % shown.length, true);
  }

  /* ---------- 特效 ---------- */
  const fx = $('#fx'); const g = fx.getContext('2d'); let parts = []; let raf = 0;
  function sizeFx() { fx.width = innerWidth * devicePixelRatio; fx.height = innerHeight * devicePixelRatio; }
  addEventListener('resize', sizeFx); sizeFx();
  function loop() {
    g.clearRect(0, 0, fx.width, fx.height);
    parts = parts.filter(p => p.life > 0);
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += p.gr; p.life -= 1; p.rot += p.vr;
      g.save(); g.globalAlpha = Math.min(1, p.life / 30); g.translate(p.x, p.y); g.rotate(p.rot);
      if (p.ch) { g.font = `${p.s}px serif`; g.fillText(p.ch, -p.s / 2, p.s / 2); }
      else { g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); }
      g.restore();
    });
    raf = parts.length ? requestAnimationFrame(loop) : 0;
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }
  function burst(x, y, chars) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const d = devicePixelRatio;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5;
      parts.push({ x: x * d, y: y * d, vx: Math.cos(a) * sp * d, vy: Math.sin(a) * sp * d - 2 * d, gr: .15 * d, life: 50 + Math.random() * 20, rot: 0, vr: (Math.random() - .5) * .3, s: (16 + Math.random() * 12) * d, ch: chars[i % chars.length] });
    }
    kick();
  }
  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cols = ['#f43f5e', '#f97316', '#facc15', '#22c55e', '#0ea5e9', '#8b5cf6', '#ec4899'];
    const d = devicePixelRatio;
    for (let i = 0; i < 160; i++) {
      parts.push({ x: Math.random() * fx.width, y: -20 * d - Math.random() * fx.height * .3, vx: (Math.random() - .5) * 3 * d, vy: (2 + Math.random() * 3) * d, gr: .05 * d, life: 160 + Math.random() * 80, rot: Math.random() * 6, vr: (Math.random() - .5) * .3, s: (8 + Math.random() * 8) * d, c: cols[i % cols.length] });
    }
    kick();
  }
  function initFloaters() {
    const box = $('#floaters');
    const em = ['🎬', '✨', '📚', '💡', '🎵', '⭐', '🔬', '🎞️'];
    let html = '';
    for (let i = 0; i < 12; i++) {
      html += `<span style="left:${(i * 8.3 + Math.random() * 5).toFixed(1)}%;animation-duration:${18 + Math.random() * 16}s;animation-delay:-${(Math.random() * 30).toFixed(1)}s;font-size:${1.1 + Math.random() * 1.3}rem">${em[i % em.length]}</span>`;
    }
    box.innerHTML = html;
  }

  /* ---------- 事件 ---------- */
  function initEvents() {
    const grid = $('#grid');
    grid.addEventListener('click', e => {
      const fb = e.target.closest('[data-fav]');
      if (fb) { e.stopPropagation(); toggleFav(fb.dataset.fav, fb); return; }
      const card = e.target.closest('.card');
      if (card) openPlayer(+card.dataset.i);
    });
    grid.addEventListener('keydown', e => {
      const card = e.target.closest('.card');
      if (card && (e.key === 'Enter' || e.key === ' ') && !e.target.closest('[data-fav]')) { e.preventDefault(); openPlayer(+card.dataset.i); }
    });
    let lastHover = 0;
    grid.addEventListener('pointerover', e => {
      const card = e.target.closest('.card');
      if (card && e.pointerType === 'mouse' && !card.contains(e.relatedTarget) && Date.now() - lastHover > 90) { lastHover = Date.now(); SFX.play('hover'); }
    });

    $('#chips').addEventListener('click', e => {
      const c = e.target.closest('[data-filter]'); if (!c) return;
      filter = c.dataset.filter; SFX.play('click'); render();
      c.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    });

    const input = $('#searchInput');
    let deb;
    input.addEventListener('input', () => {
      SFX.play('type');
      $('#searchClear').hidden = !input.value;
      clearTimeout(deb); deb = setTimeout(() => { query = input.value; render(); }, 120);
    });
    $('#searchClear').addEventListener('click', () => { input.value = ''; query = ''; $('#searchClear').hidden = true; SFX.play('click'); render(); input.focus(); });

    $('#sortSelect').addEventListener('change', e => { sort = e.target.value; store.set('sort', sort); SFX.play('click'); render(); });
    $$('.seg-btn').forEach(b => b.addEventListener('click', () => { view = b.dataset.view; store.set('view', view); SFX.play('toggle'); render(); }));

    $('#btnRandom').addEventListener('click', () => {
      if (!shown.length) return;
      SFX.play('dice');
      const r = $('#btnRandom').getBoundingClientRect(); burst(r.left + r.width / 2, r.bottom, ['🎲', '✨', '⭐']);
      setTimeout(() => openPlayer(Math.floor(Math.random() * shown.length)), 350);
    });
    $('#btnRefresh').addEventListener('click', async () => {
      SFX.play('click');
      const b = $('#btnRefresh span'); b.style.transition = 'transform .8s'; b.style.transform = 'rotate(360deg)';
      await boot(true);
      b.style.transition = 'none'; b.style.transform = '';
      toast(t('refreshed'));
    });

    $$('[data-close]').forEach(el => el.addEventListener('click', closePlayer));
    $('#btnPrev').addEventListener('click', () => step(-1));
    $('#btnNext').addEventListener('click', () => step(1));
    $('#btnFav').addEventListener('click', e => { const v = shown[current]; if (v) toggleFav(v.id, e.currentTarget); });
    $('#btnShare').addEventListener('click', async () => {
      const v = shown[current]; if (!v) return;
      const url = location.origin + location.pathname + '#v=' + v.id;
      try {
        if (navigator.share && matchMedia('(pointer:coarse)').matches) await navigator.share({ title: v.title, url });
        else { await navigator.clipboard.writeText(url); toast(t('copied')); }
        SFX.play('fav');
      } catch (e) { /* 使用者取消 */ }
    });

    // 手機上在資訊區左右滑動切換影片
    let sx = null;
    $('.player-info').addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    $('.player-info').addEventListener('touchend', e => {
      if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
    });

    document.addEventListener('keydown', e => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (e.key === 'Escape') { if (!$('#settings').hidden) closeSettings(); else closePlayer(); return; }
      if (!$('#player').hidden) {
        if (e.key === 'ArrowRight') step(1);
        if (e.key === 'ArrowLeft') step(-1);
        return;
      }
      if (e.key === '/' && !typing) { e.preventDefault(); input.focus(); }
    });

    $('#folderLink').href = CFG.FOLDER_URL || '#';

    // PWA 安裝按鈕
    let deferred = null;
    addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#btnInstall').hidden = false; });
    $('#btnInstall').addEventListener('click', async () => {
      if (!deferred) return; SFX.play('click');
      deferred.prompt(); await deferred.userChoice; deferred = null; $('#btnInstall').hidden = true;
    });
    addEventListener('appinstalled', () => { toast(t('installed')); SFX.play('win'); });
  }

  /* ---------- 啟動 ---------- */
  async function boot(force) {
    $('#loading').hidden = videos.length > 0;
    const { list, source } = await loadData(force);
    // 上架日期＝上傳到雲端硬碟的時間（created）；舊檔的「修改時間」可能早於上傳日
    videos = list.filter(v => v && v.id && v.title)
      .map(v => Object.assign({}, v, { date: v.created || v.date || '' }));
    $('#loading').hidden = true;
    $('#sourceInfo').textContent = T().src[source] || '';
    render();
    const m = location.hash.match(/v=([\w-]+)/);
    if (m && $('#player').hidden) {
      const idx = shown.findIndex(v => v.id === m[1]);
      if (idx >= 0) openPlayer(idx, true);
    }
  }

  applySettings();
  applyI18n();
  initSettingsUI();
  initEvents();
  initFloaters();
  boot(false);

  // 回到頁面時或每 3 分鐘自動檢查新影片
  let lastCheck = Date.now();
  async function autoCheck() {
    if (document.hidden || !$('#player').hidden || Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    const before = new Set(videos.map(v => v.id));
    await boot(false);
    const added = videos.filter(v => !before.has(v.id)).length;
    if (added) { toast(T().added(added)); SFX.play('fav'); }
  }
  document.addEventListener('visibilitychange', autoCheck);
  setInterval(autoCheck, 180000);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !/[?&]nosw\b/.test(location.search)) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
