# Media Monitoring Dashboard

A lightweight, client-side media monitoring dashboard for RSS feeds, Google News searches, and custom HTML widgets, built with vanilla JavaScript and Materialize CSS.

## Features

- **Multiple Dashboards**: Create and manage multiple thematic dashboards in tabs.
- **Widgets**:
  - **HTML Widget**: Render custom HTML content.
  - **RSS Widget**: Fetch and display RSS feeds (powered by rss2json).
  - **Google News Widget**: Search for news topics and display results.
- **Persistence**: automatically saves your setup to browser's LocalStorage.
- **Import/Export**: Export your configuration to JSON and import it back.
- **Auto-refresh**: feed widgets reload every 15 minutes, plus a manual Refresh button.
- **Thumbnails**: feed items show a small image when the feed provides one.
- **Responsive Design**: Works on desktop and mobile.

## Tech Stack

- **HTML5**
- **CSS3** (Materialize CSS)
- **JavaScript** (No build step, no modules)
- **No Backend**: Runs entirely in the browser.

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

## Widget Layout (fully user-controlled)

Every dashboard has its own free-form grid. Nothing about the positions is hardcoded.

- **Layout mode** — click **Layout** in the dashboard header. Cards get a dashed outline.
- **Move** — drag any card and drop it where you want it. The order is saved immediately.
- **Resize** — drag the corner grip at the bottom-right of a card. Width snaps to the
  12-column grid (1/12 → full width), height is free in pixels. Drag the card shorter
  than the minimum height to return it to *automatic* height.
- **Width at creation** — the Add/Edit Widget dialog has a **Widget Width** selector
  (narrow → full width).
- **Reset** — the **Reset** button (visible in layout mode) puts every widget back to the
  default 1/3 width and automatic height.

Layout data lives with the widget in LocalStorage, so it is included in **Export** and
**Import** (older configs without a `layout` field get defaults automatically):

```json
{
  "id": "…",
  "type": "rss",
  "title": "Anthropic",
  "config": { "url": "…" },
  "layout": { "w": 8, "h": 420 }
}
```

`w` = columns out of 12 (1–12). `h` = height in pixels, or `0` for automatic.
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
can keep the previous `js/` and `css/` for up to 10 minutes. Bump `v` (currently `v=8`)
on every release that touches code or styles so the change appears immediately.

