# Nice List Movies 🎄

A Christmas movie ranker + randomizer. Phone-first web app (installable to the home screen), no build step, no dependencies.

## Run it locally

```bash
cd "/Users/martylanglo/Claude/Projects/Christmas Movie Ranker"
python3 -m http.server 8123
```

Open http://localhost:8123 (use the browser's phone-size view to preview).

## Getting covers and streaming info

Covers, search, suggestions and "where to watch" come from TMDB (free). Get a key at themoviedb.org → Settings → API, then paste it in the app under **More → Covers & streaming**. The key is stored only on the device, never in this code.

## Putting it on your phone

The app needs to be served over https to install to the home screen and work offline. Any static host works (Netlify Drop, Cloudflare Pages, GitHub Pages): upload this folder as-is. Then open the link in Safari → Share → **Add to Home Screen**.

## Where the data lives

Everything (list, ranking, watched years, notes) is stored on the device in the browser's local storage. Use **More → Save backup** now and then. Backups never include the TMDB key.

## Layout

- `js/store.js` data + persistence · `js/tmdb.js` TMDB client · `js/list.js` ranked list + drag reorder
- `js/spin.js` poster-reel randomizer · `js/discover.js` watch list + suggestions · `js/detail.js` movie sheet, add, bulk import
- `js/more.js` stats, settings, backup · `sw.js` offline cache (bump `VERSION` when shipping changes)

## If this becomes a product

TMDB's free tier is for non-commercial use; a commercial release needs a TMDB licence (or another cover source). Sync/accounts would add a backend; the data model in `store.js` is already one plain JSON document per user.
