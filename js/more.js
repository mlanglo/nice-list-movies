// "More" tab: yearly stats, TMDB key, region, backup/restore, import.
import * as S from './store.js';
import * as T from './tmdb.js';
import { $, $$, esc, toast, sleep } from './ui.js';
import { openImport, openDetail } from './detail.js';

export const busy = () => false;
const REGIONS = [['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'], ['AU', 'Australia'], ['NZ', 'New Zealand'], ['IE', 'Ireland'], ['DE', 'Germany'], ['FR', 'France'], ['ES', 'Spain'], ['IT', 'Italy'], ['NL', 'Netherlands'], ['SE', 'Sweden'], ['MX', 'Mexico'], ['BR', 'Brazil']];

export function render(root) {
  const st = S.getState(), s = st.settings;
  const years = Object.entries(Object.values(st.watches).flat().reduce((a, y) => (a[y] = (a[y] || 0) + 1, a), {}))
    .sort((a, b) => b[0] - a[0]);
  const max = Math.max(1, ...years.map(y => y[1]));
  const backup = s.lastBackup ? new Date(s.lastBackup).toLocaleDateString() : 'never';
  const total = st.ranked.length + st.nr.length;

  root.innerHTML = `
    <section class="view more">
      <h2 class="sect">🎄 Movies watched each year</h2>
      ${years.length ? years.map(([y, n]) => `
        <details class="yr-row"><summary><b>${y}</b><span class="barwrap"><i style="width:${n / max * 100}%"></i></span><span>${n}</span></summary>
          <ul class="plain">${Object.entries(st.watches).filter(([, a]) => a.includes(+y)).map(([id]) => st.movies[id]).filter(Boolean)
            .sort((a, b) => (S.rankOf(a.id) || 999) - (S.rankOf(b.id) || 999))
            .map(m => `<li data-open="${m.id}">${esc(m.title)} <span class="muted">${m.year || ''}</span></li>`).join('')}</ul></details>`).join('')
        : '<p class="muted">Check off movies as you watch them and your yearly totals show up here.</p>'}

      <h2 class="sect">🎬 Covers &amp; streaming (TMDB)</h2>
      <p class="muted small">Covers, search, suggestions and “where to watch” come from the free TMDB service. Get a key at <b>themoviedb.org</b> → Settings → API (choose “Developer”, personal use). Paste either the API Key or the Read Access Token.</p>
      <div class="row-inline"><input id="key" type="password" autocomplete="off" placeholder="Paste TMDB key" value="${esc(s.tmdbKey)}"><button class="btn gold" id="savekey">Save &amp; test</button></div>
      <label class="field">Streaming country
        <select id="region">${REGIONS.map(([c, n]) => `<option value="${c}" ${s.region === c ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <div class="btn-row">
        <button class="btn" id="covers">Find missing covers</button>
        <button class="btn" id="refresh">Refresh streaming info</button>
      </div>

      <h2 class="sect">📋 Lists</h2>
      <button class="btn wide" id="imp">Import a list (paste titles)</button>

      <h2 class="sect">💾 Backup</h2>
      <p class="muted small">Your data lives on this phone only. Save a backup now and then (to Files or iCloud Drive) in case the app is ever deleted. Last backup: <b>${backup}</b>.</p>
      <div class="btn-row">
        <button class="btn gold" id="export">Save backup</button>
        <button class="btn" id="import">Restore backup</button>
      </div>
      <input type="file" id="file" accept="application/json,.json" hidden>
      <p class="tiny muted center">${total} movies · Nice List Movies<br>Movie data from <a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a>; streaming data by JustWatch. Not endorsed or certified by TMDB.</p>
    </section>`;

  $$('[data-open]', root).forEach(li => li.onclick = () => openDetail(li.dataset.open));
  $('#imp', root).onclick = openImport;

  $('#savekey', root).onclick = async () => {
    const v = $('#key', root).value.trim();
    S.setSetting('tmdbKey', v);
    if (!v) { toast('Key removed'); return; }
    try { await T.testKey(); toast('✓ Key works!'); T.refreshProviders(S.allIds()); }
    catch (e) { toast(T.friendlyError(e)); }
  };
  $('#region', root).onchange = (e) => {
    S.setSetting('region', e.target.value);
    T.refreshProviders(S.allIds(), { force: true });
    toast('Refreshing streaming info…');
  };
  $('#refresh', root).onclick = () => {
    if (!T.hasKey()) return toast('Add your TMDB key first');
    T.refreshProviders([...S.allIds(), ...S.getState().queue.map(q => q.id)], { force: true });
    toast('Refreshing streaming info in the background…');
  };

  $('#covers', root).onclick = async (e) => {
    if (!T.hasKey()) return toast('Add your TMDB key first');
    const label = (t) => { const b = document.getElementById('covers'); if (b) b.textContent = t; };
    const missing = S.allIds().map(id => S.getState().movies[id]).filter(m => !m.tmdbId);
    if (!missing.length) return toast('Every movie already has a match 🎉');
    let ok = 0, miss = 0;
    try {
      for (let i = 0; i < missing.length; i++) {
        label(`Matching ${i + 1}/${missing.length}…`);
        const { best } = await T.matchTitle(missing[i].title, missing[i].year);
        if (best) { S.updateItem(missing[i].id, { tmdbId: best.tmdbId, year: missing[i].year || best.year, poster: best.poster, overview: best.overview }, { soft: true }); ok++; }
        else miss++;
        await sleep(60);
      }
      T.refreshProviders(missing.map(m => m.id));
      toast(`Matched ${ok}${miss ? `, ${miss} not found` : ''}. Wrong one? Open it → “Wrong cover?”`, { ms: 7000 });
    } catch (err) { toast(T.friendlyError(err)); }
    label('Find missing covers');
  };

  $('#export', root).onclick = async () => {
    const text = S.exportJSON();
    const name = `nice-list-movies-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([text], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Nice List Movies backup' });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      }
      S.markBackup(); toast('Backup saved');
    } catch (e) { if (e.name !== 'AbortError') toast('Could not save the backup'); }
  };
  $('#import', root).onclick = () => $('#file', root).click();
  $('#file', root).onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      const d = JSON.parse(text);
      if (!confirm(`Replace everything on this device with the backup (${Object.keys(d.movies || {}).length} movies)?`)) return;
      S.importJSON(text);
      toast('Backup restored 🎄');
    } catch (err) { toast("That file isn't a Nice List Movies backup"); }
    e.target.value = '';
  };
}
