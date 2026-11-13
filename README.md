# Dashboard for RSS, Google News, and HTML Widgets

A lightweight, client-side dashboard application built with vanilla JavaScript and Materialize CSS, designed to aggregate and display content from RSS feeds, Google News searches, and custom HTML widgets.

## Features

- **Multiple Dashboards**: Create and manage multiple thematic dashboards in tabs.
- **Widgets**:
  - **HTML Widget**: Render custom HTML content.
  - **RSS Widget**: Fetch and display RSS feeds (powered by rss2json).
  - **Google News Widget**: Search for news topics and display results.
- **Persistence**: automatically saves your setup to browser's LocalStorage.
- **Import/Export**: Export your configuration to JSON and import it back.
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

