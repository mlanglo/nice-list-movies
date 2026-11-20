// Small shared UI helpers: escaping, posters, bottom sheets, toasts, snow, lights.
import * as S from './store.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// A poster <img>, or a festive placeholder showing the title when there's no cover.
export function poster(m, size = 'w185', cls = 'thumb') {
  const u = S.posterUrl(m, size);
  if (!u) return `<div class="${cls} ph"><span>${esc(m.title)}</span></div>`;
  return `<img class="${cls}" src="${esc(u)}" alt="" loading="lazy" data-t="${esc(m.title)}">`;
}
// If a cover fails to load (offline, bad URL) swap in the placeholder.
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t.tagName === 'IMG' && t.dataset.t !== undefined) {
    const d = document.createElement('div');
    d.className = t.className + ' ph';
    d.innerHTML = `<span>${esc(t.dataset.t)}</span>`;
    t.replaceWith(d);
  }
}, true);

// Streaming logos. Shows where it's included with a subscription, else rent/buy hints.
export function streamers(p) {
  if (!p) return [];
  const seen = new Set();
  return [...(p.flatrate || []), ...(p.free || [])].filter(x => !seen.has(x.id) && seen.add(x.id));
}
export function providerStrip(m, max = 4) {
  const p = m.providers;
  if (!p) return '';
  const st = streamers(p);
  if (st.length) {
    return `<span class="prov">${st.slice(0, max).map(x =>
      `<img src="${S.IMG}/w45${x.logo}" title="${esc(x.name)}" alt="${esc(x.name)}">`).join('')}${st.length > max ? `<em>+${st.length - max}</em>` : ''}</span>`;
  }
  if ((p.rent || []).length || (p.buy || []).length) return `<span class="prov tag">Rent / buy</span>`;
  return `<span class="prov tag none">Not streaming</span>`;
}

// ---------- toast ----------
export function toast(msg, { action, onAction, ms = 4200 } = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), ms);
  if (action) t.querySelector('button').onclick = () => { t.classList.remove('show'); onAction && onAction(); };
}

// ---------- bottom sheet ----------
export function openSheet(html = '', { cls = '' } = {}) {
  const root = $('#sheet-root');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="backdrop"></div><div class="sheet ${cls}" role="dialog" aria-modal="true"><button class="x" aria-label="Close">✕</button><div class="sheet-body"></div></div>`;
  root.appendChild(wrap);
  document.body.classList.add('lock');
  const body = $('.sheet-body', wrap);
  body.innerHTML = html;
  const api = {
    el: body,
    set(h) { body.innerHTML = h; },
    close() {
      if (!wrap.isConnected) return;
      wrap.remove();
      if (!root.children.length) document.body.classList.remove('lock');
      api.onClose && api.onClose();
    },
  };
  $('.backdrop', wrap).onclick = api.close;
  $('.x', wrap).onclick = api.close;
  return api;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { const w = $$('.sheet-wrap'); w.length && w[w.length - 1].querySelector('.x').click(); }
});

// ---------- confetti (red / green / gold flakes) ----------
export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#d03a44', '#3aa56b', '#f4c95d', '#fbf3df'];
  for (let i = 0; i < 46; i++) {
    const f = document.createElement('i');
    f.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % 4]};--dx:${(Math.random() - .5) * 160}px;--r:${Math.random() * 720}deg;animation-delay:${Math.random() * .4}s;animation-duration:${1.6 + Math.random() * 1.2}s`;
    box.appendChild(f);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3400);
}

// ---------- decorative: snow + string lights ----------
export function initSnow(canvas) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  let w, h, flakes = [];
  const size = () => { w = canvas.width = innerWidth; h = canvas.height = innerHeight; };
  size(); addEventListener('resize', size);
  const n = innerWidth < 600 ? 38 : 70;
  for (let i = 0; i < n; i++) flakes.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 2.4 + .8, s: Math.random() * .6 + .25, d: Math.random() * Math.PI * 2 });
  let raf;
  const tick = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (const f of flakes) {
      f.y += f.s; f.d += .01; f.x += Math.sin(f.d) * .35;
      if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
    }
    raf = requestAnimationFrame(tick);
  };
  tick();
  document.addEventListener('visibilitychange', () => { cancelAnimationFrame(raf); if (!document.hidden) tick(); });
}

export function initLights(el) {
  const colors = ['#ff4d4d', '#ffd24d', '#4dd27a', '#4da6ff'];
  const build = () => {
    const n = Math.max(10, Math.ceil(el.clientWidth / 34));
    if (el.children.length === n) return;
    el.innerHTML = Array.from({ length: n }, (_, i) =>
      `<i class="bulb" style="--c:${colors[i % 4]};--d:${(i % 5) * .45}s"></i>`).join('');
  };
  build();
  addEventListener('resize', build);
}
