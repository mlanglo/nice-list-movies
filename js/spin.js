// "Spin" tab: a slot-machine reel of posters that lands on a movie you haven't watched this year.
import * as S from './store.js';
import * as T from './tmdb.js';
import { $, esc, poster, providerStrip, toast, confetti } from './ui.js';
import { openDetail } from './detail.js';

const ITEM_W = 130, GAP = 10, PITCH = ITEM_W + GAP;
let spinning = false, winnerId = null, audio = null;
export const busy = () => spinning;

// Unbiased random integer using the browser's crypto source.
function randInt(n) {
  const a = new Uint32Array(1), lim = Math.floor(0x100000000 / n) * n;
  do { crypto.getRandomValues(a); } while (a[0] >= lim);
  return a[0] % n;
}
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function tick() {
  if (!S.getState().settings.sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'triangle'; o.frequency.value = 900 + Math.random() * 120;
    g.gain.setValueAtTime(.06, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + .05);
    o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + .06);
  } catch (_) {}
}

const item = (m, cls = '') => `<div class="ri ${cls}" data-id="${m.id}">${poster(m, 'w342', 'pi')}</div>`;

export function render(root) {
  const st = S.getState(), year = S.currentYear();
  const pool = S.poolFor(year);
  const { total, watched } = S.counts(year);

  if (!total) {
    root.innerHTML = `<section class="view spin"><div class="empty"><div class="big-emoji">🎰</div><h2>Nothing to spin yet</h2><p class="muted">Add movies to your list first.</p>
      <button class="btn big gold" data-goto="list">Go to my list</button></div></section>`;
    return;
  }
  if (!pool.length) {
    root.innerHTML = `<section class="view spin"><div class="empty"><div class="big-emoji">🏆</div><h2>You've watched them all in ${year}!</h2>
      <p class="muted">All ${total} movies are checked off. Add a new one, or uncheck a favorite to watch it again.</p>
      <button class="btn big gold" data-goto="discover">Find something new</button></div></section>`;
    return;
  }

  const movies = pool.map(id => st.movies[id]);
  const shown = shuffled(movies);
  root.innerHTML = `
    <section class="view spin">
      <p class="pool-line"><b>${pool.length}</b> movie${pool.length === 1 ? '' : 's'} still in the pool for ${year} · ${watched} watched</p>
      <div class="reel" id="reel"><div class="strip" id="strip">${Array.from({ length: 9 }, (_, i) => item(shown[i % shown.length])).join('')}</div></div>
      <button class="spin-btn" id="spin">${winnerId ? 'SPIN AGAIN' : 'SPIN'}</button>
      <button class="linkbtn" id="snd">${st.settings.sound ? '🔊 Sound on' : '🔇 Sound off'}</button>
      <div id="result"></div>
    </section>`;
  const reelW = $('#reel', root).clientWidth;
  centerOn(4, reelW);
  $('.ri:nth-child(5)', root).classList.add('center');

  $('#spin', root).onclick = () => spin(root, movies);
  $('#snd', root).onclick = (e) => {
    const on = !S.getState().settings.sound;
    S.setSetting('sound', on);
  };
  if (winnerId && S.getState().movies[winnerId] && S.poolFor(year).includes(winnerId)) showResult(root, winnerId, false);
}

function centerOn(index, reelW) {
  $('#strip').style.transform = `translateX(${xFor(index, reelW)}px)`;
}
const xFor = (index, reelW) => -(index * PITCH + ITEM_W / 2) + reelW / 2;

function spin(root, movies) {
  if (spinning) return;
  spinning = true;
  winnerId = null;
  $('#result', root).innerHTML = '';
  const btn = $('#spin', root);
  btn.disabled = true; btn.textContent = '…';
  if (audio && audio.state === 'suspended') audio.resume();
  else if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} }

  const win = movies[randInt(movies.length)];
  const reel = $('#reel', root), strip = $('#strip', root);
  const reelW = reel.clientWidth;
  const W = 44 + randInt(4);                     // index the winner sits at
  const seq = [];
  let bag = [];
  const draw = () => { if (!bag.length) bag = shuffled(movies); return bag.pop(); };
  for (let i = 0; i < W + 7; i++) {
    let m = i === W ? win : draw();
    if (movies.length > 1) { while ((i > 0 && m.id === seq[i - 1].id) || (i === W - 1 && m.id === win.id) || (i === W + 1 && m.id === win.id)) m = draw(); }
    seq.push(m);
  }
  strip.innerHTML = seq.map(m => item(m)).join('');
  const items = [...strip.children];
  const startX = xFor(3, reelW), endX = xFor(W, reelW);
  const dur = 6200, t0 = performance.now();
  let lastIdx = -1;
  strip.style.transition = 'none';

  const frame = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - t, 4);               // fast start, long gentle stop
    const x = startX + (endX - startX) * e;
    strip.style.transform = `translateX(${x}px)`;
    const idx = Math.round((reelW / 2 - ITEM_W / 2 - x) / PITCH);
    if (idx !== lastIdx) {
      items[lastIdx] && items[lastIdx].classList.remove('center');
      items[idx] && items[idx].classList.add('center');
      lastIdx = idx;
      tick();
    }
    if (t < 1) requestAnimationFrame(frame);
    else land(root, win.id, items[W]);
  };
  requestAnimationFrame(frame);
}

function land(root, id, el) {
  spinning = false;
  winnerId = id;
  el && el.classList.add('winner');
  confetti();
  try { navigator.vibrate && navigator.vibrate([40, 40, 80]); } catch (_) {}
  const btn = $('#spin', root);
  btn.disabled = false; btn.textContent = 'SPIN AGAIN';
  showResult(root, id, true);
  T.refreshProviders([id]);
  window.dispatchEvent(new Event('yr:idle'));
}

function showResult(root, id, fresh) {
  const m = S.getState().movies[id];
  const year = S.currentYear();
  const pos = S.rankOf(id);
  const box = $('#result', root);
  if (!box) return;
  box.innerHTML = `
    <div class="result ${fresh ? 'pop' : ''}">
      <div class="kicker">Tonight's movie</div>
      <h2>${esc(m.title)} ${m.year ? `<span class="yr">${m.year}</span>` : ''}</h2>
      <div class="muted">${pos ? `Ranked #${pos}` : '<b class="nrtag">NR</b> not ranked yet'}</div>
      <div class="rstream">${providerStrip(m, 6)}</div>
      ${m.overview ? `<p class="overview clamp3">${esc(m.overview)}</p>` : ''}
      <button class="btn big gold" id="did">✓ We watched it!</button>
      <button class="linkbtn" id="more">Details, notes &amp; streaming</button>
    </div>`;
  $('#did', box).onclick = () => {
    S.setWatched(id, year, true);
    winnerId = null;
    toast(`✓ ${m.title} checked off for ${year}`, pos ? {} : { action: 'Rank it', onAction: () => openDetail(id), ms: 7000 });
  };
  $('#more', box).onclick = () => openDetail(id);
  if (fresh) box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
