(function() {
    // Thumbnail enrichment.
    // The rss-to-json proxy used for the items strips media:content / media:thumbnail,
    // so images come from a second, image-aware source and are cached per feed.
    const THUMB_CACHE_KEY = 'dashboard_feed_thumbs_v1';
    const THUMB_TTL_MS = 60 * 60 * 1000;      // refresh the thumbnail map once an hour
    const THUMB_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
    const THUMB_MAX_ITEMS = 50;

    // feedUrl -> Promise<map>, so two widgets on the same feed share one request.
    const inflightThumbs = new Map();

    function isHttpUrl(value) {
        return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
    }

    function normalizeLink(url) {
        return String(url || '')
            .trim()
            .replace(/#.*$/, '')
            .replace(/\/+$/, '');
    }

    function firstImageFromHtml(html) {
        if (!html || typeof html !== 'string') return null;
        // DOMParser creates an inert document, so the parsed <img> is never fetched.
        if (typeof DOMParser === 'undefined') return null;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const img = doc.querySelector('img[src]');
        return img ? img.getAttribute('src') : null;
    }

    function pickThumb(item) {
        if (!item) return null;

        if (isHttpUrl(item.thumbnail)) return item.thumbnail.trim();

        const enclosure = item.enclosure;
        if (enclosure) {
            if (isHttpUrl(enclosure.thumbnail)) return enclosure.thumbnail.trim();
            if (isHttpUrl(enclosure.link) && /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(enclosure.link)) {
                return enclosure.link.trim();
            }
        }

        const fromHtml = firstImageFromHtml(item.content) || firstImageFromHtml(item.description);
        if (isHttpUrl(fromHtml)) {
            // Ignore obvious 1x1 tracking pixels.
            if (/\b(1x1|pixel|spacer)\b/i.test(fromHtml)) return null;
            return fromHtml.trim();
        }
        return null;
    }

    function readThumbCache() {
        try {
            const raw = localStorage.getItem(THUMB_CACHE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function writeThumbCache(cache) {
        try {
            const cutoff = Date.now() - THUMB_MAX_AGE_MS;
            Object.keys(cache).forEach(key => {
                if (!cache[key] || !(cache[key].at > cutoff)) delete cache[key];
            });
            localStorage.setItem(THUMB_CACHE_KEY, JSON.stringify(cache));
        } catch (e) {
            // Quota or private mode: images simply fall back to no cache.
        }
    }

    // Re-reads the cache right before writing so feeds that finish together
    // do not overwrite each other's entry.
    function saveThumbEntry(feedUrl, map, failed) {
        const fresh = readThumbCache();
        fresh[feedUrl] = { at: Date.now(), map: map, failed: !!failed };
        writeThumbCache(fresh);
    }

    async function fetchThumbMap(feedUrl) {
        if (inflightThumbs.has(feedUrl)) return inflightThumbs.get(feedUrl);

        const promise = (async () => {
            const cache = readThumbCache();
            const cached = cache[feedUrl];
            const ttl = cached && cached.failed ? 10 * 60 * 1000 : THUMB_TTL_MS;
            if (cached && cached.map && (Date.now() - cached.at) < ttl) {
                return cached.map;
            }

            const fallback = cached && cached.map ? cached.map : {};
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), 12000) : null;

            try {
                const apiUrl = 'https://api.rss2json.com/v1/api.json?count=' + THUMB_MAX_ITEMS +
                    '&rss_url=' + encodeURIComponent(feedUrl);
                const response = await fetch(apiUrl, controller ? { signal: controller.signal } : undefined);
                if (!response.ok) {
                    saveThumbEntry(feedUrl, fallback, true);
                    return fallback;
                }

                const data = await response.json();
                if (!data || data.status !== 'ok' || !Array.isArray(data.items)) {
                    saveThumbEntry(feedUrl, fallback, true);
                    return fallback;
                }

                const map = {};
                data.items.forEach(item => {
                    const thumb = pickThumb(item);
                    if (thumb && item.link) {
                        map[normalizeLink(item.link)] = thumb;
                    }
                });

                saveThumbEntry(feedUrl, map, false);
                return map;
            } catch (e) {
                saveThumbEntry(feedUrl, fallback, true);
                return fallback;
            } finally {
                if (timer) clearTimeout(timer);
            }
        })();

        inflightThumbs.set(feedUrl, promise);
        try {
            return await promise;
        } finally {
            inflightThumbs.delete(feedUrl);
        }
    }

    class RssWidget extends App.BaseWidget {
        constructor(id, title, config, layout) {
            super(id, title, config, layout);
            this._contentDiv = null;
            this._thumbToken = 0;
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

        addThumb(itemDiv, src) {
            const img = document.createElement('img');
            img.className = 'rss-item-thumb';
            img.src = src;
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.referrerPolicy = 'no-referrer';
            img.addEventListener('error', () => {
                img.remove();
                itemDiv.classList.remove('has-thumb');
            });
            itemDiv.insertBefore(img, itemDiv.firstChild);
            itemDiv.classList.add('has-thumb');
        }

        async applyThumbnails(contentDiv, feedUrl, token) {
            if (this.config.showImages === false) return;

            const map = await fetchThumbMap(feedUrl);
            if (token !== this._thumbToken) return; // a newer render replaced this one

            const items = contentDiv.querySelectorAll('.rss-item[data-link]');
            items.forEach(itemDiv => {
                if (itemDiv.querySelector('.rss-item-thumb')) return;
                const thumb = map[normalizeLink(itemDiv.dataset.link)];
                if (thumb) this.addThumb(itemDiv, thumb);
            });
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
                    if (item.link) itemDiv.dataset.link = item.link;

                    const body = document.createElement('div');
                    body.className = 'rss-item-body';

                    const itemLink = document.createElement('a');
                    itemLink.className = 'rss-item-link';
                    itemLink.href = item.link;
                    itemLink.target = '_blank';
                    itemLink.rel = 'noopener noreferrer';
                    itemLink.textContent = item.title;

                    body.appendChild(itemLink);

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
                        body.appendChild(dateEl);
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
                        body.appendChild(itemDesc);
                    }

                    itemDiv.appendChild(body);
                    list.appendChild(itemDiv);
                });
                contentDiv.appendChild(list);

                // Thumbnails load after the text so the list appears immediately.
                this._thumbToken += 1;
                this.applyThumbnails(contentDiv, rssUrl, this._thumbToken).catch(() => {});
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
