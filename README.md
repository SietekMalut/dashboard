# Media Monitoring Dashboard

A lightweight, client-side media monitoring dashboard for RSS feeds, Google News searches, and custom HTML widgets, built with vanilla JavaScript and Materialize CSS.

## Features

- **Multiple Dashboards**: Create and manage multiple thematic dashboards in tabs.
- **Widgets**:
  - **HTML Widget**: Render custom HTML content.
  - **RSS Widget**: Fetch and display RSS feeds (powered by rss2json).
  - **Google News Widget**: Search for news topics and display results.
  - **News Analysis Widget**: Read-only analysis views (headlines, sentiment, sources, overview).
  - **Running Text**: Scrolling headlines published **today** on the **Berita Lokal** dashboard.
- **Built-in Analysis Dashboard**: “Analisa Pemberitaan” is added once for every
  user. It reads the feeds in the **Berita Lokal** dashboard automatically.
- **Accounts (optional)**: username + password login with super-admin approval,
  no email required. When configured, all dashboards are locked until approved.
- **Per-user cloud storage**: each account's dashboards sync to Supabase with RLS.
- **Persistence**: automatically saves your setup to browser's LocalStorage.
- **Import/Export**: Export your configuration to JSON and import it back.
- **Auto-refresh**: feed widgets reload every 15 minutes, plus a manual Refresh button.
- **Thumbnails**: feed items show a small image when the feed provides one.
- **Responsive Design**: Works on desktop and mobile.

## Tech Stack

- **HTML5**
- **CSS3** (Materialize CSS)
- **JavaScript** (No build step, no modules)
- **Optional backend**: runs entirely in the browser by default; with Supabase
  credentials it gains accounts, approval and per-user cloud storage.

## Deployment & Hosting

### GitHub Pages

This repository is configured to automatically deploy to GitHub Pages.

- **URL**: `https://<your-username>.github.io/<repository-name>/`
- **Setup**:
  1. Go to your repository settings on GitHub.
  2. Navigate to "Pages" in the sidebar.
  3. Under "Build and deployment", ensure the source is set to "GitHub Actions".
  4. The included workflow `.github/workflows/static.yml` will handle the rest on every push to the main branch.

### Local Execution

You can run this application locally without any server:
1. Clone the repository.
2. Open `index.html` directly in your web browser.

## Analisa Pemberitaan

A built-in dashboard is seeded once (on first load after this version) with four cards:

| Card | What it shows |
| --- | --- |
| **Ringkasan Pemberitaan** | Number of articles, distinct media, configured feeds, and the top headline. |
| **Headline Terpopuler** | Ranked headlines with a **cross-media popularity score**, number of media/outlets, and sentiment. |
| **Sentimen Pemberitaan** | Share of **Positif / Negatif / Netral** articles, with counts and percentages. |
| **Media Teraktif** | Media ordered by how many articles they published in the period. |

### Where the data comes from

- Only RSS and Google News widgets inside the dashboard named **Berita Lokal**
  (case-insensitive; exact name match) are used. Other dashboards are ignored.
- The proxy supplies title, link, publication date, description and Google News source
  name — **it does not supply reader/view counts**. The “popularity” figure is therefore
  honestly labelled a cross-media score: same story carried by more media scores higher,
  with a small recency bonus. It is never presented as an audience number.
- Only items from the last **7 days** (configurable 1–30 per widget) are analysed; one
  article per title per outlet avoids inflating a single outlet's score.
- Sentiment uses a local Indonesian keyword lexicon with negation and intensifier
  handling. No external API or key is required, so results are approximate, not a
  human-verified judgement.
- One shared 10-minute cache serves all four cards; **Refresh** forces a new fetch.
- The dashboard is seeded only once (tracked by `analysisDashboardSeeded` in saved
  state). Deleting it afterwards will not bring it back. The active dashboard is never
  switched by the seeding.

You can also add a **Analisis Berita** widget to any dashboard and choose the view,
source dashboard name, and period in its settings.

A **Running Text** widget can be added to any dashboard. In its settings choose either:
- **Dashboard tertentu** — default `Berita Lokal`, or any other dashboard name; or
- **Pilih widget tertentu** — tick individual RSS / Google News widgets across all
  dashboards, so national and local feeds can be mixed freely. There is **no limit**
  on how many widgets/feeds can be selected.

It scrolls only headlines whose publication date is today in the browser's timezone;
undated and older items are excluded. Set **seconds per headline** — total scroll
duration grows with the number of headlines, so more news never scrolls faster.
Every running text uses **8 seconds per headline** (including existing widgets,
updated once on load), except running text on — or sourced from — **Berita Nasional**,
which uses a calmer **18 seconds per headline**. A speed you choose later is kept.
Headline font size is adjustable from **12–48 px** (default 21 px) and applies on
mobile as well. Hovering pauses the scroll.
It reuses the same 10-minute cache as the analysis widgets.

## Login & Persetujuan Akun

Login aktif setelah `SUPABASE_URL` dan `SUPABASE_ANON_KEY` diisi di `js/config.js`.
Sebelum itu aplikasi berjalan dalam **mode lokal** tanpa layar login.

- Pengguna mendaftar hanya dengan **username** (3–20 karakter: huruf kecil, angka, `_`)
  dan **password** (minimal 6 karakter). **Email tidak pernah diminta** — Supabase
  mendapat email teknis otomatis dari username.
- Akun baru berstatus **menunggu persetujuan** dan belum bisa membuka dashboard.
- **Super admin** membuka menu **Admin** di header untuk menyetujui/menolak akun
  dan mengatur peran.
- Semua dashboard terkunci sampai akun disetujui; state tiap akun tersimpan terpisah
  di Supabase dan dilindungi RLS.

Panduan lengkap (SQL, konfigurasi, menunjuk super admin pertama):
[`supabase/SETUP.md`](supabase/SETUP.md) dan [`supabase/schema.sql`](supabase/schema.sql).

## Widget Layout (fully user-controlled)

Every dashboard has its own free-form grid. Nothing about the positions is hardcoded.

- **Layout mode** — click **Layout** in the dashboard header. Cards get a dashed outline
  and the arrangement toolbar appears.
- **Move** — drag a card. In **Grid** mode dropping it on another card reorders the row;
  in **Free** mode it follows the pointer anywhere on the canvas. Saved immediately.
- **Resize** — drag the corner grip at the bottom-right of a card. Width snaps to the
  12-column grid (1/12 → full width), height is free in pixels. Drag the card shorter
  than the minimum height to return it to *automatic* height.
- **Width at creation** — the Add/Edit Widget dialog has a **Widget Width** selector
  (narrow → full width).
- **Reset** — the **Reset** button (visible in layout mode) puts every widget back to the
  default 1/3 width, automatic height, Grid mode and normal spacing.

### Arrangement toolbar

| Control | What it does |
| --- | --- |
| **Grid** | Classic flow grid: cards fill rows in order. |
| **Free** | 2D canvas: every card keeps its own `x`/`y` on the same 12 columns. Drag anywhere, no overlap is forced. |
| **Tight / Normal / Roomy** | Row spacing (0.75 / 1.5 / 2.5 rem). |
| **Tidy** | Re-packs the canvas into neat rows in reading order (top→bottom, left→right), using each card's current width. |
| **4×4** | Preset for **4 cards per row × 4 rows** (16 widgets). Sets every card to quarter width with automatic height, then positions the rows using the measured heights. Extra widgets continue below. Works in both Grid and Free mode. |

The **4×4** button is a starting arrangement, not a lock: after applying it you can still
drag any card to another spot and resize its width/height freely from the corner grip.
A fresh canvas also starts with four cards per row.

Free canvas needs a wide screen (over 992px). On tablets and phones it automatically
falls back to the normal stacked grid, and switching back to **Grid** keeps the visual
order you had on the canvas.

### Card style

The Add/Edit Widget dialog has a **Card style** panel, so each card can look different:

- **Accent** — 7 colors (default, blue, green, amber, pink, red, teal) used for the top
  border, handle and title.
- **Card style** — `default`, `outline` (transparent + colored border), `solid`
  (tinted gradient) or `minimal` (no card, colored left rule).
- **Content density** — `normal` or `compact` (tighter padding, smaller thumbnails).
- **Title alignment** — `left` or `center`.

Layout and style data live with the widget in LocalStorage, so they are included in
**Export** and **Import** (older configs without these fields get defaults automatically):

```json
{
  "id": "…",
  "type": "rss",
  "title": "Anthropic",
  "config": { "url": "…" },
  "layout": { "w": 8, "h": 420, "x": 0, "y": 0 },
  "style": { "accent": "blue", "theme": "solid", "density": "compact", "align": "left" }
}
```

`w` = columns out of 12 (1–12). `h` = height in pixels, or `0` for automatic.
`x` / `y` = position on the free canvas (column 0–11, pixels from the top). The dashboard
itself stores `"canvas": true|false` and `"gap": "compact" | "normal" | "loose"`.
Layouts are responsive: below 992px wide a card never shrinks under half width, and on
phones every card becomes full width.

## Automatic feed refresh

Every feed widget re-fetches its data **every 15 minutes** in the background, without
reloading the page — scroll position, layout mode and open dialogs are untouched.

- The status line under the dashboard title shows the interval and the last update time.
- **Refresh** in the dashboard header forces an immediate reload of every widget.
- Only widgets with remote data do any work; static HTML widgets answer `refresh()` with
  `false` and are left alone.
- The countdown is paused by the browser while the tab is hidden (timers are throttled).
  When you come back after the interval has elapsed, the dashboard catches up at once.
- Override the interval for testing with `?refresh=<minutes>`, e.g.
  `?refresh=0.5` for 30 seconds.

Implementation: `js/refresh.js` owns the scheduler (`App.Refresh`); each feed widget
implements `resolveFeedUrl()` + `refresh()` so the card is never rebuilt. Note that
GitHub Pages itself caches assets, not data — the fetches go straight to the RSS proxy.

## Feed thumbnails

Every feed item shows a small image on the left when the feed provides one.

- The item list still comes from the `ar-xr.com` proxy, which strips image metadata, so
  thumbnails are resolved from `api.rss2json.com` (`thumbnail`, `enclosure` or the first
  `<img>` in the item content).
- Thumbnail maps are cached in LocalStorage (`dashboard_feed_thumbs_v1`) for **1 hour per
  feed**, so auto-refresh does not call the image service every 15 minutes (it has a
  60-requests/hour limit per IP). Failed lookups are retried after 10 minutes.
- Feeds whose publisher blocks that service (for example Google News) simply stay
  text-only — no error is shown and the rest of the widget keeps working.
- Images are lazy-loaded and removed silently if they fail to load.
- Turn images off for one widget with `"config": { "showImages": false }`.

### Asset cache

Local assets are requested with a `?v=N` query string (`index.html`, `demo/index.html`).
GitHub Pages serves everything with `Cache-Control: max-age=600`, so a returning visitor
can keep the previous `js/` and `css/` for up to 10 minutes. Bump `v` (currently `v=22`)
on every release that touches code or styles so the change appears immediately.

