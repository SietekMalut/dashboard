(function () {
    'use strict';

    if (!App.BaseWidget) {
        console.error('BaseWidget not found. NewsAnalysisWidget cannot be initialized.');
        return;
    }

    // One widget type, four read-only views over the same cached analysis result.
    // mode: 'headlines' | 'sentiment' | 'sources' | 'overview'
    class NewsAnalysisWidget extends App.BaseWidget {
        constructor(id, title, config, layout) {
            super(id, title, config, layout);
            this.mode = this.config.mode || 'headlines';
            this.dashboardName = this.config.dashboardName || 'Berita Lokal';
            this.days = parseInt(this.config.days, 10) || 7;
            this._contentDiv = null;
            this._loading = false;
        }

        async render(container) {
            const { col, widgetBody } = this.createCardElement();
            container.appendChild(col); // Card appears immediately, with a loading state.

            const contentDiv = this.el('div', 'news-analysis-content');
            widgetBody.appendChild(contentDiv);
            this._contentDiv = contentDiv;

            await this.load(false);
        }

        // `force` bypasses the 10-minute shared cache (used by the refresh button/scheduler).
        async load(force) {
            const target = this._contentDiv;
            if (!target || this._loading) return false;
            this._loading = true;

            try {
                if (!App.NewsAnalysis) throw new Error('missing-module');
                const data = await App.NewsAnalysis.load({
                    dashboardName: this.dashboardName,
                    days: this.days
                }, !!force);
                this.draw(target, data);
                return !data || !data.error;
            } catch (error) {
                console.error('News analysis widget failed:', error);
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
        // DOM helpers (always textContent — never inject feed HTML)
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

        linkedTitle(title, url, className) {
            const href = this.safeLink(url);
            if (!href) return this.el('span', className, title);
            const link = this.el('a', className, title);
            link.href = href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            return link;
        }

        sentimentLabel(value) {
            if (value === 'positif') return 'Positif';
            if (value === 'negatif') return 'Negatif';
            return 'Netral';
        }

        badge(sentiment) {
            const label = this.sentimentLabel(sentiment);
            return this.el('span', 'na-badge na-badge-' + label.toLowerCase(), label);
        }

        empty(message) {
            return this.el('div', 'na-empty', message);
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

        footnote(data) {
            const note = this.el('div', 'na-footnote');
            const source = 'Sumber: dashboard “' + (data.dashboardName || 'Berita Lokal') + '” · ' +
                (data.days || 7) + ' hari terakhir';
            note.appendChild(this.el('span', '', source));
            if (data.fetchedAt) {
                note.appendChild(this.el('span', 'na-footnote-time', 'diperbarui ' + this.timeLabel(data.fetchedAt)));
            }
            return note;
        }

        // Popularity is cross-media frequency, not audience/view counts.
        scoreNote() {
            return this.el('div', 'na-note',
                'Skor popularitas = seberapa sering judul sama muncul di media berbeda ' +
                '(bukan jumlah pembaca; RSS tidak menyediakan data pembaca).');
        }

        draw(target, data) {
            target.innerHTML = '';
            if (!data) {
                target.appendChild(this.drawErrorNode('failed'));
                return;
            }
            if (data.error) {
                target.appendChild(this.drawErrorNode(data.error, data.dashboardName, data.days));
                return;
            }

            switch (this.mode) {
                case 'sentiment':
                    target.appendChild(this.drawSentiment(data));
                    break;
                case 'sources':
                    target.appendChild(this.drawSources(data));
                    break;
                case 'overview':
                    target.appendChild(this.drawOverview(data));
                    break;
                case 'headlines':
                default:
                    target.appendChild(this.drawHeadlines(data));
                    break;
            }
            target.appendChild(this.footnote(data));
        }

        drawError(target, code, dashboardName, days) {
            target.innerHTML = '';
            target.appendChild(this.drawErrorNode(code, dashboardName, days));
        }

        drawErrorNode(code, dashboardName, days) {
            const name = dashboardName || this.dashboardName;
            const period = days || this.days;
            let message;

            if (code === 'no-feeds') {
                message = 'Belum ada feed berita di dashboard “' + name + '”. ' +
                    'Tambahkan widget RSS atau Google News pada dashboard tersebut, lalu buka kembali halaman ini.';
            } else if (code === 'no-articles') {
                message = 'Tidak ada berita ' + period + ' hari terakhir yang bisa dianalisis ' +
                    'dari dashboard “' + name + '”. Coba perbarui feed atau perpanjang periode.';
            } else {
                message = 'Gagal memuat analisis berita. Periksa koneksi internet, lalu gunakan tombol Refresh.';
            }
            return this.empty(message);
        }

        drawHeadlines(data) {
            const wrap = this.el('div', 'na-headlines');
            const clusters = (data.clusters || []).slice(0, 12);
            if (!clusters.length) {
                wrap.appendChild(this.empty('Belum ada headline yang bisa dirangking.'));
                return wrap;
            }

            clusters.forEach((item, index) => {
                const row = this.el('div', 'na-headline-row');

                row.appendChild(this.el('span', 'na-rank', String(index + 1)));

                const main = this.el('div', 'na-headline-main');
                main.appendChild(this.linkedTitle(item.title, item.link, 'na-headline-title'));

                const media = item.sources && item.sources.length ? item.sources.length : 1;
                const meta = this.el('div', 'na-headline-meta');
                meta.appendChild(this.el('span', '', media + ' media'));
                meta.appendChild(this.el('span', 'na-meta-dot', '·'));
                meta.appendChild(this.el('span', '', (item.articles || media) + ' artikel'));
                meta.appendChild(this.el('span', 'na-meta-dot', '·'));
                meta.appendChild(this.badge(item.sentiment));
                main.appendChild(meta);
                row.appendChild(main);

                const score = this.el('span', 'na-score', String(item.score || 0));
                score.title = 'Skor popularitas lintas media (bukan jumlah pembaca)';
                row.appendChild(score);

                wrap.appendChild(row);
            });

            wrap.appendChild(this.scoreNote());
            return wrap;
        }

        drawSentiment(data) {
            const wrap = this.el('div', 'na-sentiment');
            const sentiment = data.sentiment || { positif: 0, netral: 0, negatif: 0, total: 0 };
            const total = sentiment.total || 0;

            if (!total) {
                wrap.appendChild(this.empty('Belum ada berita untuk dianalisis sentimennya.'));
                return wrap;
            }

            ['positif', 'netral', 'negatif'].forEach(key => {
                const label = this.sentimentLabel(key);
                const count = sentiment[key] || 0;
                const percent = Math.round((count / total) * 100);

                const row = this.el('div', 'na-sentiment-row');
                row.appendChild(this.el('span', 'na-sentiment-label na-text-' + key, label));

                const bar = this.el('div', 'na-bar');
                const fill = this.el('div', 'na-bar-fill na-fill-' + key);
                fill.style.width = percent + '%';
                bar.appendChild(fill);
                row.appendChild(bar);

                row.appendChild(this.el('span', 'na-sentiment-count', count + ' (' + percent + '%)'));
                wrap.appendChild(row);
            });

            wrap.appendChild(this.el('div', 'na-note',
                'Sentimen dihitung dari kata kunci pada judul dan ringkasan berita ' +
                'dengan kamus bahasa Indonesia (tanpa layanan eksternal).'));
            return wrap;
        }

        drawSources(data) {
            const wrap = this.el('div', 'na-sources');
            const sources = (data.sources || []).slice(0, 12);
            if (!sources.length) {
                wrap.appendChild(this.empty('Belum ada data media yang bisa ditampilkan.'));
                return wrap;
            }

            const max = sources[0].count || 1;
            sources.forEach((source, index) => {
                const row = this.el('div', 'na-source-row');
                row.appendChild(this.el('span', 'na-rank', String(index + 1)));
                row.appendChild(this.el('span', 'na-source-name', source.name));

                const bar = this.el('div', 'na-bar');
                const fill = this.el('div', 'na-bar-fill na-fill-source');
                fill.style.width = Math.max(2, Math.round((source.count / max) * 100)) + '%';
                bar.appendChild(fill);
                row.appendChild(bar);

                row.appendChild(this.el('span', 'na-source-count', String(source.count)));
                wrap.appendChild(row);
            });

            wrap.appendChild(this.el('div', 'na-note',
                'Jumlah artikel per media dalam periode ini (judul unik per media).'));
            return wrap;
        }

        drawOverview(data) {
            const wrap = this.el('div', 'na-overview');
            const articles = (data.articles || []).length;
            const media = (data.sources || []).length;
            const feeds = (data.feeds || []).length;

            const stats = this.el('div', 'na-stat-grid');
            [
                [articles, 'artikel'],
                [media, 'media'],
                [feeds, 'feed']
            ].forEach(pair => {
                const stat = this.el('div', 'na-stat');
                stat.appendChild(this.el('span', 'na-stat-value', String(pair[0])));
                stat.appendChild(this.el('span', 'na-stat-label', pair[1]));
                stats.appendChild(stat);
            });
            wrap.appendChild(stats);

            const top = data.clusters && data.clusters[0];
            if (top) {
                const highlight = this.el('div', 'na-overview-top');
                highlight.appendChild(this.el('span', 'na-overview-top-label', 'Headline terpopuler'));
                highlight.appendChild(this.linkedTitle(top.title, top.link, 'na-overview-top-title'));
                const meta = this.el('div', 'na-headline-meta');
                meta.appendChild(this.el('span', '',
                    (top.sources ? top.sources.length : 1) + ' media · skor ' + (top.score || 0)));
                meta.appendChild(this.el('span', 'na-meta-dot', '·'));
                meta.appendChild(this.badge(top.sentiment));
                highlight.appendChild(meta);
                wrap.appendChild(highlight);
            }

            const sentiment = data.sentiment;
            if (sentiment && sentiment.total) {
                const strip = this.el('div', 'na-mini-sentiment');
                ['positif', 'netral', 'negatif'].forEach(key => {
                    const count = sentiment[key] || 0;
                    const percent = Math.round((count / sentiment.total) * 100);
                    const chip = this.el('span', 'na-mini-chip na-mini-' + key);
                    chip.appendChild(this.el('span', 'na-mini-dot'));
                    chip.appendChild(this.el('span', '', this.sentimentLabel(key) + ' ' + percent + '%'));
                    strip.appendChild(chip);
                });
                wrap.appendChild(strip);
            }

            wrap.appendChild(this.el('div', 'na-note',
                'Ringkasan pemberitaan ' + (data.days || 7) + ' hari terakhir. ' +
                'Angka dihitung ulang setiap refresh; skor popularitas bukan jumlah pembaca.'));
            return wrap;
        }
    }

    App.Widgets.NewsAnalysisWidget = NewsAnalysisWidget;
})();
