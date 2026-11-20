import * as S from './store.js';
import * as T from './tmdb.js';
import * as List from './list.js';
import * as Spin from './spin.js';
import * as Discover from './discover.js';
import * as More from './more.js';
import { $, $$, esc, initSnow, initLights } from './ui.js';

const views = { list: List, spin: Spin, discover: Discover, more: More };
const scrolls = {};
let tab = 'list', pending = false;
try { tab = localStorage.getItem('yr-tab') || 'list'; } catch (_) {}
if (!views[tab]) tab = 'list';

function renderHeader() {
  const year = S.currentYear(), { total, watched } = S.counts(year);
  $('#year').innerHTML = S.yearsList().map(y => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`).join('');
  $('#progress').innerHTML = total
    ? `<b>${watched}</b> of ${total} watched${watched === total ? ' 🏆' : ''}`
    : 'Add your first movie';
  $('#pbar i').style.width = total ? (watched / total * 100) + '%' : '0%';
}

function renderView() {
  const v = views[tab];
  if (v.busy && v.busy()) { pending = true; return; }
  pending = false;
  v.render($('#view'));
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
}

function go(t) {
  scrolls[tab] = scrollY;
  tab = t;
  try { localStorage.setItem('yr-tab', t); } catch (_) {}
  renderView();
  scrollTo(0, scrolls[t] || 0);
}

S.subscribe(() => { renderHeader(); renderView(); });
window.addEventListener('yr:idle', () => { if (pending) renderView(); });
window.addEventListener('yr:goto', (e) => go(e.detail));

$$('.tabs button').forEach(b => b.onclick = () => go(b.dataset.tab));
$('#year').onchange = (e) => S.setYear(e.target.value);
$('#view').addEventListener('click', (e) => {
  const g = e.target.closest('[data-goto]');
  if (g) go(g.dataset.goto);
});

List.bind();
Discover.bind();
initSnow($('#snow'));
initLights($('#lights'));
renderHeader();
renderView();

// Ask the browser to keep our data safe, and quietly refresh stale streaming info.
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (_) {}
setTimeout(() => T.refreshProviders(S.allIds()), 1500);

// Offline support (needs https; skipped while developing on localhost).
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
