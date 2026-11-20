(function () {
    'use strict';

    if (!App.BaseWidget) {
        console.error('BaseWidget not found. HeadlineTickerWidget cannot be initialized.');
        return;
    }

    // Scrolling headlines taken from the RSS / Google News feeds inside the
    // dashboard named in config (default: "Berita Lokal"). Only items whose
    // publication date is TODAY in the browser's own timezone are shown.
    // The 7-day analysis cache is reused so this widget does not fetch feeds twice.
    class HeadlineTickerWidget extends App.BaseWidget {
        constructor(id, title, config, layout) {
            super(id, title, config, layout);
            this.dashboardName = this.config.dashboardName || 'Berita Lokal';
            this.speed = Math.max(10, Math.min(300, parseInt(this.config.speed, 10) || 45));
            this._contentDiv = null;
            this._loading = false;
        }

        async render(container) {
            const { col, widgetBody } = this.createCardElement();
            container.appendChild(col);

            const root = this.el('div', 'ht-root');
            widgetBody.appendChild(root);
            this._contentDiv = root;

            await this.load(false);
        }

        async load(force) {
            const target = this._contentDiv;
            if (!target || this._loading) return false;
            this._loading = true;

            try {
                if (!App.NewsAnalysis) throw new Error('missing-module');
                const data = await App.NewsAnalysis.load({
                    dashboardName: this.dashboardName,
                    days: 7
                }, !!force);
                this.draw(target, data);
                return !data || !data.error;
            } catch (error) {
                console.error('Headline ticker failed:', error);
                this.drawError(target, 'failed');
                return false;
            } finally {
                this._loading = false;
            }
        }

        async refresh() {
            return this.load(true);
        }

        // -----------------------------------------------------------
        // Helpers (textContent only — feed HTML is never injected)
        // -----------------------------------------------------------

        el(tag, className, text) {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text !== undefined && text !== null) node.textContent = String(text);
            return node;
        }

        safeLink(url) {
            if (!url || typeof url !== 'string') return null;
            try {
                const parsed = new URL(url, window.location.href);
                return parsed.protocol === 'http:' || parsed.protocol === 'https:'
                    ? parsed.href
                    : null;
            } catch (e) {
                return null;
            }
        }

        isToday(timestamp) {
            if (!timestamp) return false; // undated items are not claimed as "today"
            const date = new Date(timestamp);
            const now = new Date();
            return date.getFullYear() === now.getFullYear() &&
                date.getMonth() === now.getMonth() &&
                date.getDate() === now.getDate();
        }

        timeLabel(timestamp) {
            if (!timestamp) return '';
            try {
                return new Date(timestamp).toLocaleTimeString('id-ID', {
                    hour: '2-digit', minute: '2-digit'
                });
            } catch (e) {
                return '';
            }
        }

        todayArticles(data) {
            return (data.articles || [])
                .filter(article => this.isToday(article.date))
                .sort((a, b) => b.date - a.date);
        }

        errorMessage(data) {
            const name = data.dashboardName || this.dashboardName;
            if (data.error === 'no-feeds') {
                return 'Belum ada feed berita di dashboard “' + name + '”. ' +
                    'Tambahkan widget RSS atau Google News pada dashboard tersebut.';
            }
            if (data.error === 'no-articles') {
                return 'Tidak ada artikel yang bisa dibaca dari dashboard “' + name + '”.';
            }
            return 'Headline belum bisa dimuat. Coba tombol Refresh.';
        }

        buildGroup(articles) {
            const group = this.el('div', 'ht-group');
            articles.forEach(article => {
                const item = this.el('span', 'ht-item');
                const title = this.el('span', 'ht-title', article.title);
                const href = this.safeLink(article.link);

                if (href) {
                    const link = this.el('a', 'ht-link');
                    link.href = href;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.appendChild(title);
                    item.appendChild(link);
                } else {
                    item.appendChild(title);
                }

                if (article.source) item.appendChild(this.el('span', 'ht-source', article.source));
                if (article.date) item.appendChild(this.el('span', 'ht-time', this.timeLabel(article.date)));
                group.appendChild(item);
            });
            return group;
        }

        draw(target, data) {
            target.innerHTML = '';

            if (!data || data.error) {
                target.appendChild(this.el('div', 'ht-empty',
                    data ? this.errorMessage(data) : 'Headline belum bisa dimuat. Coba tombol Refresh.'));
                return;
            }

            const articles = this.todayArticles(data);
            if (!articles.length) {
                target.appendChild(this.el('div', 'ht-empty',
                    'Belum ada headline dari dashboard “' + (data.dashboardName || this.dashboardName) +
                    '” yang terbit hari ini.'));
                return;
            }

            const strip = this.el('div', 'ht-strip');
            strip.appendChild(this.el('span', 'ht-badge', 'HARI INI'));

            const viewport = this.el('div', 'ht-viewport');
            const track = this.el('div', 'ht-track');
            track.style.animationDuration = this.speed + 's';

            // Two identical groups make the -50% loop seamless.
            track.appendChild(this.buildGroup(articles));
            const copy = this.buildGroup(articles);
            copy.setAttribute('aria-hidden', 'true');
            track.appendChild(copy);

            viewport.appendChild(track);
            strip.appendChild(viewport);
            target.appendChild(strip);

            const updated = data.fetchedAt ? ' · diperbarui ' + this.timeLabel(data.fetchedAt) : '';
            target.appendChild(this.el('div', 'ht-meta',
                articles.length + ' headline · ' + (data.dashboardName || this.dashboardName) + updated));
        }

        drawError(target) {
            target.innerHTML = '';
            target.appendChild(this.el('div', 'ht-empty', 'Headline belum bisa dimuat. Coba tombol Refresh.'));
        }
    }

    App.Widgets.HeadlineTickerWidget = HeadlineTickerWidget;
})();
