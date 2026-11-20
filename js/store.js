// Data layer: one JSON blob in localStorage, plain functions to change it.
// Everything that changes data goes through here so the views just re-render.

const KEY = 'yuletide-reel-v1';
export const IMG = 'https://image.tmdb.org/t/p';

const blank = () => ({
  v: 1,
  settings: { tmdbKey: '', region: 'US', keywordId: null, year: null, lastBackup: null, sound: true },
  movies: {},      // id -> movie
  ranked: [],      // ids, best first
  nr: [],          // ids awaiting a rank (newest first)
  watches: {},     // id -> [years watched]
  queue: [],       // "my watch list": movies I haven't added to the ranked list yet
  dismissed: [],   // tmdb ids hidden from suggestions
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const b = blank();
      return { ...b, ...s, settings: { ...b.settings, ...(s.settings || {}) } };
    }
  } catch (e) { console.warn('Could not load saved data', e); }
  return blank();
}

const state = load();
const listeners = new Set();
let saveTimer, softTimer, batchDepth = 0, dirty = false;

export const getState = () => state;
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn('Could not save', e); }
  }, 120);
}
function commit() { save(); listeners.forEach(f => f()); }
function changed() { if (batchDepth) dirty = true; else commit(); }
// For background updates (streaming info arriving): save now, redraw a moment later.
function changedSoft() {
  save();
  clearTimeout(softTimer);
  softTimer = setTimeout(() => listeners.forEach(f => f()), 600);
}
export function batch(fn) {
  batchDepth++;
  try { fn(); } finally {
    batchDepth--;
    if (!batchDepth && dirty) { dirty = false; commit(); }
  }
}
window.addEventListener('pagehide', () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} });

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 9));

// ---------- settings & year ----------
export const setSetting = (k, v) => { state.settings[k] = v; changed(); };
export const calendarYear = () => new Date().getFullYear();
export const currentYear = () => state.settings.year || calendarYear();
export const setYear = (y) => setSetting('year', +y === calendarYear() ? null : +y);

export function yearsList() {
  const s = new Set([calendarYear(), calendarYear() - 1, calendarYear() - 2]);
  Object.values(state.watches).forEach(a => a.forEach(y => s.add(y)));
  s.add(currentYear());
  return [...s].sort((a, b) => b - a);
}

// ---------- posters ----------
export function posterUrl(m, size = 'w342') {
  if (!m) return null;
  if (m.customPoster) return m.customPoster;
  return m.poster ? `${IMG}/${size}${m.poster}` : null;
}

// ---------- lookups ----------
export const allIds = () => [...state.ranked, ...state.nr];
export const rankOf = (id) => { const i = state.ranked.indexOf(id); return i < 0 ? null : i + 1; };
export const findByTmdb = (tmdbId) => Object.values(state.movies).find(m => m.tmdbId === tmdbId);
export const inQueue = (tmdbId) => state.queue.find(q => q.tmdbId === tmdbId);
export const seen = (tmdbId) => !!(findByTmdb(tmdbId) || inQueue(tmdbId));
export const getItem = (id) => state.movies[id] || state.queue.find(q => q.id === id);

// ---------- movies ----------
export function addMovie(data, { ranked = false, position = null } = {}) {
  const id = uid();
  state.movies[id] = {
    id, tmdbId: null, title: '', year: null, poster: null, customPoster: null,
    overview: '', notes: '', providers: null, added: Date.now(), ...data,
  };
  if (ranked) {
    if (position == null || position > state.ranked.length) state.ranked.push(id);
    else state.ranked.splice(Math.max(0, position), 0, id);
  } else state.nr.unshift(id);
  changed();
  return id;
}

export function updateItem(id, patch, { soft = false } = {}) {
  const m = getItem(id);
  if (!m) return;
  Object.assign(m, patch);
  soft ? changedSoft() : changed();
}

// Put a movie at a 1-based rank (moving it if it's already ranked, or ranking an NR movie).
export function moveTo(id, pos) {
  if (!state.movies[id]) return;
  state.nr = state.nr.filter(x => x !== id);
  state.ranked = state.ranked.filter(x => x !== id);
  const i = Math.min(Math.max(1, Math.round(pos) || 1), state.ranked.length + 1) - 1;
  state.ranked.splice(i, 0, id);
  changed();
}
export function unrank(id) {
  if (!state.ranked.includes(id)) return;
  state.ranked = state.ranked.filter(x => x !== id);
  state.nr.unshift(id);
  changed();
}
export function removeMovie(id) {
  delete state.movies[id];
  delete state.watches[id];
  state.ranked = state.ranked.filter(x => x !== id);
  state.nr = state.nr.filter(x => x !== id);
  changed();
}

// ---------- watched (per year) ----------
export const watchYears = (id) => (state.watches[id] || []).slice().sort((a, b) => b - a);
export const isWatched = (id, year) => (state.watches[id] || []).includes(year);
export function setWatched(id, year, on) {
  const a = new Set(state.watches[id] || []);
  on ? a.add(year) : a.delete(year);
  if (a.size) state.watches[id] = [...a]; else delete state.watches[id];
  changed();
}
export const poolFor = (year) => allIds().filter(id => !isWatched(id, year));
export function counts(year) {
  const ids = allIds();
  return { total: ids.length, watched: ids.filter(id => isWatched(id, year)).length };
}

// ---------- my watch list (queue) ----------
export function addQueue(data) {
  const id = uid();
  state.queue.push({ id, tmdbId: null, title: '', year: null, poster: null, overview: '', providers: null, added: Date.now(), ...data });
  changed();
  return id;
}
export function removeQueue(id) { state.queue = state.queue.filter(q => q.id !== id); changed(); }
export function promoteQueue(id) {
  const q = state.queue.find(x => x.id === id);
  if (!q) return null;
  const { id: _drop, added: _a, ...data } = q;
  state.queue = state.queue.filter(x => x.id !== id);
  return addMovie(data); // lands as NR
}
export function dismiss(tmdbId) {
  if (!state.dismissed.includes(tmdbId)) state.dismissed.push(tmdbId);
  changed();
}

// ---------- backup ----------
export function exportJSON() {
  const { movies, ranked, nr, watches, queue, dismissed } = state;
  return JSON.stringify({ app: 'nice-list-movies', v: 1, exported: new Date().toISOString(), movies, ranked, nr, watches, queue, dismissed }, null, 1);
}
export function importJSON(text) {
  const d = JSON.parse(text);
  if (!d || typeof d.movies !== 'object' || !Array.isArray(d.ranked) || !Array.isArray(d.nr)) throw new Error('Not a Nice List Movies backup');
  state.movies = d.movies;
  state.ranked = d.ranked;
  state.nr = d.nr;
  state.watches = d.watches || {};
  state.queue = d.queue || [];
  state.dismissed = d.dismissed || [];
  changed();
}
export const markBackup = () => setSetting('lastBackup', Date.now());
