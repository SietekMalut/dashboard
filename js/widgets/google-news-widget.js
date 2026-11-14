(function() {
    // Ensure RssWidget is available
    if (!App.Widgets.RssWidget) {
        console.error('RssWidget not found. GoogleNewsWidget cannot be initialized.');
        return;
    }

    class GoogleNewsWidget extends App.Widgets.RssWidget {
        constructor(id, title, config, layout) {
            super(id, title, config, layout);
        }

        // The Google News RSS URL is derived from the search query, so it can be
        // rebuilt on every refresh without touching the stored config.
        resolveFeedUrl() {
            if (this.config.query) {
                return `https://news.google.com/rss/search?q=${encodeURIComponent(this.config.query)}`;
            }
            return this.config.url || null;
        }

        async render(container) {
            await super.render(container);
        }
    }

    App.Widgets.GoogleNewsWidget = GoogleNewsWidget;
})();
