(function() {
    class RssWidget extends App.BaseWidget {
        constructor(id, title, config, layout) {
            super(id, title, config, layout);
            this._contentDiv = null;
        }

        async render(container) {
            const { col, widgetBody } = this.createCardElement();
            container.appendChild(col); // Append first to show loading state

            const contentDiv = document.createElement('div');
            contentDiv.className = 'rss-widget-content';
            contentDiv.innerHTML = '<div class="progress"><div class="indeterminate"></div></div>';
            widgetBody.appendChild(contentDiv);

            // Keep a reference so refresh() can re-fetch into the same element.
            this._contentDiv = contentDiv;

            await this.loadItems({ showSpinner: false });
        }

        // Subclasses override this to derive the feed URL from their own config.
        resolveFeedUrl() {
            return this.config.url || null;
        }

        // Message shown by the card when the URL cannot be resolved.
        missingUrlMessage() {
            return 'No RSS URL provided.';
        }

        async loadItems(opts) {
            const contentDiv = this._contentDiv;
            if (!contentDiv) return false;

            const showSpinner = !!(opts && opts.showSpinner);
            const rssUrl = this.resolveFeedUrl();

            if (!rssUrl) {
                contentDiv.innerHTML = `<p class="red-text">${this.missingUrlMessage()}</p>`;
                return false;
            }

            if (showSpinner) {
                contentDiv.innerHTML = '<div class="progress"><div class="indeterminate"></div></div>';
            }

            try {
                // Using ar-xr.com/dashboard/rss-to-json.php to handle CORS and XML parsing
                const apiUrl = `https://ar-xr.com/dashboard/rss-to-json.php?url=${encodeURIComponent(rssUrl)}`;
                const response = await fetch(apiUrl, { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const data = await response.json();

                if (data.status !== 'ok') {
                    throw new Error('Failed to load RSS feed');
                }

                contentDiv.innerHTML = ''; // Clear once the new data arrived
                const list = document.createElement('div');

                // The proxy answers with an object (not an array) when the feed is
                // suspended or invalid, e.g. { items: { title: "Feed suspended! ..." } }
                let items = Array.isArray(data.items) ? data.items : [];

                if (items.length === 0) {
                    const messageEl = document.createElement('p');
                    messageEl.className = 'grey-text';
                    messageEl.textContent = (data.items && (data.items.title || data.items.message))
                        || 'This feed returned no items.';
                    contentDiv.appendChild(messageEl);
                    return true;
                }

                // Filter by date if configured
                if (this.config.filterDays && !isNaN(this.config.filterDays)) {
                    const days = parseInt(this.config.filterDays);
                    const cutoffDate = new Date();
                    cutoffDate.setDate(cutoffDate.getDate() - days);

                    items = items.filter(item => {
                        if (!item.pubDate) return true; // Keep items without date to be safe
                        // Handle various date formats (including YYYY-MM-DD and RFC2822)
                        let dateStr = item.pubDate;
                        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
                            dateStr = dateStr.replace(/-/g, '/'); // Fix for old Safari/IE with YYYY-MM-DD
                        }
                        const itemDate = new Date(dateStr);
                        return !isNaN(itemDate.getTime()) ? itemDate >= cutoffDate : true;
                    });
                }

                if (this.config.maxItems && !isNaN(this.config.maxItems)) {
                    items = items.slice(0, parseInt(this.config.maxItems));
                }

                items.forEach(item => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'rss-item';

                    const itemLink = document.createElement('a');
                    itemLink.className = 'rss-item-link';
                    itemLink.href = item.link;
                    itemLink.target = '_blank';
                    itemLink.textContent = item.title;

                    itemDiv.appendChild(itemLink);

                    // Handle showDate
                    if (this.config.showDate && item.pubDate) {
                        const dateEl = document.createElement('small');
                        dateEl.className = 'rss-item-date grey-text';
                        dateEl.style.display = 'block';
                        dateEl.style.marginBottom = '5px';

                        let dateStr = item.pubDate;
                        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
                            dateStr = dateStr.replace(/-/g, '/');
                        }
                        const date = new Date(dateStr);
                        dateEl.textContent = date.toLocaleString();
                        itemDiv.appendChild(dateEl);
                    }

                    // Handle showDescription - Default to true for backward compatibility
                    if (this.config.showDescription !== false) {
                        const itemDesc = document.createElement('p');
                        itemDesc.className = 'rss-item-description';
                        // descriptions often contain HTML
                        // truncate description
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = item.description;
                        itemDesc.textContent = tempDiv.textContent.substring(0, 100) + '...';
                        itemDiv.appendChild(itemDesc);
                    }

                    list.appendChild(itemDiv);
                });
                contentDiv.appendChild(list);
                return true;

            } catch (error) {
                console.error('RSS Widget Error:', error);
                contentDiv.innerHTML = `<p class="red-text">Error loading feed: ${error.message}</p>`;
                return false;
            }
        }

        // Called by the auto-refresh scheduler: re-fetch without blanking the card.
        async refresh() {
            if (!this._contentDiv) return false;
            return this.loadItems({ showSpinner: false });
        }
    }

    App.Widgets.RssWidget = RssWidget;
})();
