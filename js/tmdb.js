// TMDB (themoviedb.org) client: covers, search, streaming availability, Christmas suggestions.
// The API key lives only on this device (set in the More tab), never in the code.
import * as S from './store.js';

const API = 'https://api.themoviedb.org/3';
export const hasKey = () => !!S.getState().settings.tmdbKey.trim();

async function call(path, params = {}) {
  const key = S.getState().settings.tmdbKey.trim();
  if (!key) throw new Error('no-key');
  const url = new URL(API + path);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const headers = { accept: 'application/json' };
  // Accept either the short v3 "API Key" or the long v4 "Read Access Token".
  if (key.length > 40) headers.Authorization = 'Bearer ' + key; else url.searchParams.set('api_key', key);
  let r;
  try { r = await fetch(url, { headers }); } catch (e) { throw new Error('offline'); }
  if (r.status === 401) throw new Error('bad-key');
  if (!r.ok) throw new Error('http-' + r.status);
  return r.json();
}

export function friendlyError(e) {
  switch (e && e.message) {
    case 'no-key': return 'Add your free TMDB key in the More tab first.';
    case 'bad-key': return 'TMDB did not accept that key. Check it in the More tab.';
    case 'offline': return "Can't reach TMDB right now. Check your connection.";
    default: return 'Something went wrong talking to TMDB.';
  }
}

const normalize = (m) => ({
  tmdbId: m.id,
  title: m.title,
  year: m.release_date ? +m.release_date.slice(0, 4) : null,
  poster: m.poster_path || null,
  overview: m.overview || '',
  votes: m.vote_count || 0,
});

export const testKey = () => call('/configuration');

export async function searchMovies(query, year) {
  const d = await call('/search/movie', { query, year: year || undefined, include_adult: 'false' });
  return d.results.map(normalize);
}

const norm = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

// Find the most likely match for a title (+ optional year) and a few alternatives.
export async function matchTitle(title, year) {
  let res = await searchMovies(title, year);
  if (!res.length && year) res = await searchMovies(title);
  const exact = res.filter(r => norm(r.title) === norm(title));
  const best = exact.length ? exact.sort((a, b) => b.votes - a.votes)[0] : res[0];
  if (!best) return { best: null, candidates: [] };
  return { best, candidates: [best, ...res.filter(r => r !== best)].slice(0, 6) };
}

// ---------- streaming availability (JustWatch data via TMDB) ----------
export async function fetchProviders(tmdbId, region) {
  const d = await call(`/movie/${tmdbId}/watch/providers`);
  const r = (d.results || {})[region] || {};
  const map = (a) => (a || []).map(p => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path }));
  return { region, flatrate: map(r.flatrate), free: map(r.free).concat(map(r.ads)), rent: map(r.rent), buy: map(r.buy), link: r.link || null, fetched: Date.now() };
}

const wanted = new Map();
let running = false;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Quietly fill in / refresh streaming info for the given movie ids, one at a time.
export function refreshProviders(ids, { force = false } = {}) {
  if (!hasKey()) return;
  ids.forEach(id => wanted.set(id, force || wanted.get(id)));
  if (!running) run();
}
async function run() {
  running = true;
  try {
    while (wanted.size) {
      const [id, force] = wanted.entries().next().value;
      wanted.delete(id);
      const m = S.getItem(id);
      if (!m || !m.tmdbId) continue;
      const region = S.getState().settings.region;
      const p = m.providers;
      if (!force && p && p.region === region && Date.now() - p.fetched < 10 * 864e5) continue;
      try {
        S.updateItem(id, { providers: await fetchProviders(m.tmdbId, region) }, { soft: true });
      } catch (e) {
        if (e.message === 'bad-key' || e.message === 'offline') { wanted.clear(); break; }
      }
      await sleep(120);
    }
  } finally { running = false; }
}

// ---------- Christmas suggestions ----------
async function keywordId() {
  const s = S.getState().settings;
  if (s.keywordId) return s.keywordId;
  const d = await call('/search/keyword', { query: 'christmas' });
  const hit = d.results.find(k => k.name.toLowerCase() === 'christmas') || d.results[0];
  if (!hit) throw new Error('no-keyword');
  S.setSetting('keywordId', hit.id);
  return hit.id;
}

const iso = (d) => d.toISOString().slice(0, 10);

export async function discoverChristmas({ mode, page }) {
  const p = { with_keywords: await keywordId(), include_adult: 'false', page, language: 'en-US', with_original_language: 'en' };
  const now = new Date();
  if (mode === 'popular') {
    p.sort_by = 'popularity.desc';
    p['vote_count.gte'] = 15;
  } else if (mode === 'recent') {
    p.sort_by = 'primary_release_date.desc';
    p['primary_release_date.gte'] = iso(new Date(now.getFullYear() - 3, 0, 1));
    p['primary_release_date.lte'] = iso(now);
    p['vote_count.gte'] = 2;
  } else { // this year & upcoming
    p.sort_by = 'primary_release_date.desc';
    p['primary_release_date.gte'] = `${now.getFullYear()}-01-01`;
    p['primary_release_date.lte'] = iso(new Date(now.getFullYear() + 1, 0, 31));
  }
  const d = await call('/discover/movie', p);
  return { results: d.results.map(normalize), total: d.total_pages || 1 };
}
