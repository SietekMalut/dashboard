// Offline news analysis for the "Berita Lokal" dashboard.
// Reads the RSS/Google News feeds the user already added, then computes:
//   - headline popularity from how many different media carried the same story
//   - sentiment from an Indonesian word lexicon (no external API)
//   - the most active media sources
// The proxy does not expose reader/view counts, so "popular" is explicitly a
// cross-media score, never a claim about real audience numbers.
(function () {
    'use strict';

    const PROXY = 'https://ar-xr.com/dashboard/rss-to-json.php?url=';
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const CACHE_MS = 10 * 60 * 1000;
    const MAX_FEEDS = 20;
    const MAX_ITEMS_PER_FEED = 60;

    const STOPWORDS = ('yang di ke dari untuk pada dan atau ini itu para si sang lebih sangat ' +
        'terbaru baru juta ribu miliar tahun hari minggu bulan nama kata ' +
        'the a an of in on for to with by from at as is are was were').split(/\s+/);

    const POSITIVE = ('naik menaikkan meningkatkan peningkatan untung beruntung sukses berhasil ' +
        'pencapaian prestasi positif optimis harapan harapkan baik bagus hebat luar biasa ' +
        'mendukung dukung dukungan membantu bantu solusi menyelesaikan selesai stabil kuat ' +
        'berkembang kemajuan maju inovasi unggul unggulan menang kemenangan antusias ' +
        'apresiasi dipuji pujian murah terjangkau layak aman damai sejahtera sehat bahagia ' +
        'senang puas nyaman cepat efisien produktif rekor terbaik populer disetujui setuju ' +
        'hadiah subsidi bantuan melonjak tumbuh pertumbuhan maju sejahtera maju').split(/\s+/);

    const NEGATIVE = ('turun menurun penurunan rugi merugi kerugian gagal kegagalan negatif ' +
        'pesimis buruk jelek parah krisis konflik perang kerusuhan bencana banjir gempa ' +
        'longsor kebakaran kecelakaan kematian meninggal tewas korban sakit penyakit wafat ' +
        'tertunda masalah gangguan menghambat hambatan kontroversi skandal korupsi penipuan ' +
        'tuduhan ditahan ditangkap pelanggaran melanggar protes kritik kecaman marah kecewa ' +
        'kekecewaan khawatir cemas takut ancaman risiko bahaya mahal lambat lemah melemah ' +
        'jatuh defisit utang hutang pemecatan mogok sanksi larangan ditutup rusak kerusakan ' +
        'macet kacau sulit kesulitan miskin kemiskinan kelaparan kekeringan polusi pencemaran ' +
        'ilegal tersendat merosot terpuruk bukan').split(/\s+/);

    const NEGATORS = ['tidak', 'tak', 'belum', 'bukan', 'tanpa', 'kurang', 'gagal'];
    const INTENSIFIERS = ['sangat', 'amat', 'paling', 'lebih', 'teramat', 'sungguh'];

    let cache = { key: null, at: 0, data: null };
    let pending = null;

    function cleanText(value) {
        if (!value) return '';
        const div = document.createElement('div');
        div.innerHTML = String(value);
        return (div.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function stripHost(value) {
        try {
            return new URL(value).hostname.replace(/^www\./, '');
        } catch (e) {
            return String(value || '').replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
        }
    }

    // Google News items carry a plain source name; other feeds fall back to the
    // feed title, then to the domain.
    function sourceName(item, feed) {
        let source = item && item.source;
        if (source && typeof source === 'object') source = source.title || source.name || source.url;
        if (typeof source === 'string' && source.trim()) return source.trim();

        let title = feed && feed.title ? String(feed.title) : '';
        title = title.replace(/\s+-\s+Google Berita$/i, '').replace(/^["']|["']$/g, '').trim();
        if (title && !/^rss|^feed/i.test(title)) return title;
        return stripHost(feed && feed.url);
    }

    function parseDate(value) {
        if (!value) return 0;
        let str = String(value);
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) str = str.replace(/-/g, '/');
        const time = new Date(str).getTime();
        return isFinite(time) ? time : 0;
    }

    function tokens(text) {
        let value = cleanText(text);
        // Google News appends " - Nama Media". Removing that short suffix lets the
        // same story from two outlets compare as identical. A comma or a long tail
        // is kept, because that is usually part of the real headline.
        value = value.replace(/\s+[-|]\s+[^,|]{2,40}$/, '');
        return value
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && STOPWORDS.indexOf(word) === -1);
    }

    // Lexicon sentiment with simple negation and intensifier handling.
    function sentimentOf(text) {
        const words = tokens(text);
        let score = 0;
        let matched = 0;

        words.forEach((word, index) => {
            const positive = POSITIVE.indexOf(word) !== -1;
            const negative = NEGATIVE.indexOf(word) !== -1;
            if (!positive && !negative) return;

            let weight = 1;
            for (let back = 1; back <= 3 && index - back >= 0; back++) {
                const previous = words[index - back];
                if (INTENSIFIERS.indexOf(previous) !== -1) weight *= 1.5;
                if (NEGATORS.indexOf(previous) !== -1) weight *= -1;
            }
            score += (positive ? 1 : -1) * weight;
            matched += 1;
        });

        if (score > 0.5) return 'positif';
        if (score < -0.5) return 'negatif';
        return 'netral';
    }

    function similarity(a, b) {
        const setA = a.tokens;
        const setB = b.tokens;
        if (!setA.length || !setB.length) return 0;

        let shared = 0;
        setA.forEach(word => { if (setB.indexOf(word) !== -1) shared += 1; });
        const jaccard = shared / (setA.length + setB.length - shared);
        const joinedA = setA.join(' ');
        const joinedB = setB.join(' ');
        const contained = joinedA.indexOf(joinedB) !== -1 || joinedB.indexOf(joinedA) !== -1;
        return (jaccard >= 0.55 && shared >= 2) || contained ? 1 : 0;
    }

    // First-fit clustering: approximate "same story reported by several media".
    function clusterArticles(articles) {
        const clusters = [];
        articles.slice().sort((a, b) => b.date - a.date).forEach(article => {
            const match = clusters.find(cluster => similarity(cluster, article));
            if (match) {
                match.articles.push(article);
                if (match.articles.length > 1 && match.title.length < article.title.length) {
                    match.title = article.title;
                }
                if (article.date > match.date) match.date = article.date;
            } else {
                clusters.push({
                    title: article.title,
                    link: article.link,
                    description: article.description,
                    date: article.date,
                    tokens: article.tokens,
                    articles: [article]
                });
            }
        });

        return clusters.map(cluster => {
            const sources = {};
            cluster.articles.forEach(article => { sources[article.source] = true; });
            const sourceList = Object.keys(sources).filter(Boolean);
            const daysAgo = cluster.date
                ? Math.max(0, Math.floor((Date.now() - cluster.date) / (24 * 60 * 60 * 1000)))
                : 7;
            // Deliberately not "views": the RSS proxy has no audience data.
            // Only distinct media add reach — one outlet publishing several similar
            // stories must never look more "popular" than real cross-media coverage.
            // Recency is a small tie-breaker; article count is shown separately.
            const score = sourceList.length * 20 + Math.max(0, 7 - daysAgo);
            return {
                title: cluster.title,
                link: cluster.link,
                description: cluster.description,
                date: cluster.date,
                sources: sourceList,
                articles: cluster.articles.length,
                daysAgo: daysAgo,
                score: score,
                sentiment: sentimentOf(cluster.title + ' ' + cluster.description)
            };
        }).sort((a, b) => b.score - a.score || b.date - a.date);
    }

    function feedUrlsFromDashboard(dashboardName) {
        const wanted = String(dashboardName || 'Berita Lokal').trim().toLowerCase();
        const dashboards = (App.DashboardManager && App.DashboardManager.getDashboards()) || [];
        const target = dashboards.find(dashboard =>
            dashboard && String(dashboard.name || '').trim().toLowerCase() === wanted
        );

        const feeds = [];
        const seen = {};
        if (!target || !Array.isArray(target.widgets)) return feeds;

        target.widgets.forEach(widget => {
            if (!widget || !widget.config) return;
            let url = null;
            if (widget.type === 'rss') {
                url = widget.config.url;
            } else if (widget.type === 'google-news') {
                if (widget.config.query) {
                    url = 'https://news.google.com/rss/search?q=' +
                        encodeURIComponent(widget.config.query);
                } else {
                    url = widget.config.url;
                }
            }
            if (!url || seen[url]) return;
            seen[url] = true;
            feeds.push({
                url: url,
                label: widget.title || stripHost(url)
            });
        });

        return feeds.slice(0, MAX_FEEDS);
    }

    async function fetchFeed(feed, days) {
        const response = await fetch(PROXY + encodeURIComponent(feed.url), { cache: 'no-store' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (data.status !== 'ok' || !Array.isArray(data.items)) return [];

        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        return data.items.map(item => {
            const date = parseDate(item.pubDate);
            const title = cleanText(item.title);
            if (!title || (date && date < cutoff)) return null;
            return {
                title: title,
                link: item.link || '',
                description: cleanText(item.description).slice(0, 240),
                date: date,
                source: sourceName(item, { title: data.feed && data.feed.title, url: feed.url }),
                tokens: tokens(title)
            };
        }).filter(Boolean).slice(0, MAX_ITEMS_PER_FEED);
    }

    async function compute(opts) {
        const days = Math.max(1, Math.min(30, parseInt(opts.days, 10) || 7));
        const dashboardName = opts.dashboardName || 'Berita Lokal';
        const feeds = feedUrlsFromDashboard(dashboardName);
        const result = {
            dashboardName: dashboardName,
            days: days,
            feeds: feeds,
            articles: [],
            clusters: [],
            sentiment: { positif: 0, netral: 0, negatif: 0, total: 0 },
            sources: [],
            fetchedAt: Date.now(),
            error: null
        };

        if (!feeds.length) {
            result.error = 'no-feeds';
            return result;
        }

        const settled = await Promise.allSettled(feeds.map(feed => fetchFeed(feed, days)));
        const articles = [];
        settled.forEach((entry, index) => {
            if (entry.status === 'fulfilled') articles.push.apply(articles, entry.value);
        });

        if (!articles.length) {
            result.error = 'no-articles';
            return result;
        }

        // One article per title+source so a single outlet cannot inflate the score.
        const seen = {};
        const unique = articles.filter(article => {
            const key = article.title.toLowerCase() + '|' + article.source.toLowerCase();
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });

        unique.forEach(article => { result.sentiment[sentimentOf(article.title + ' ' + article.description)] += 1; });
        result.sentiment.total = unique.length;

        const bySource = {};
        unique.forEach(article => {
            if (!article.source) return;
            bySource[article.source] = (bySource[article.source] || 0) + 1;
        });
        result.sources = Object.keys(bySource)
            .map(name => ({ name: name, count: bySource[name] }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

        result.articles = unique;
        result.clusters = clusterArticles(unique);
        return result;
    }

    App.NewsAnalysis = {
        WEEK_MS: WEEK_MS,

        // Cached across the four analysis widgets so one refresh fetches each feed once.
        load: function (opts, force) {
            const options = opts || {};
            const key = JSON.stringify({
                name: options.dashboardName || 'Berita Lokal',
                days: options.days || 7
            });
            if (!force && cache.key === key && Date.now() - cache.at < CACHE_MS) {
                return Promise.resolve(cache.data);
            }
            if (pending) return pending;

            pending = compute(options).then(data => {
                cache = { key: key, at: Date.now(), data: data };
                return data;
            }).catch(error => {
                console.error('News analysis failed:', error);
                const fallback = {
                    dashboardName: options.dashboardName || 'Berita Lokal',
                    days: options.days || 7,
                    feeds: [], articles: [], clusters: [],
                    sentiment: { positif: 0, netral: 0, negatif: 0, total: 0 },
                    sources: [], fetchedAt: Date.now(), error: 'failed'
                };
                return fallback;
            }).then(data => {
                pending = null;
                return data;
            });
            return pending;
        },

        invalidate: function () {
            cache = { key: null, at: 0, data: null };
        },

        // Exposed for tests/debugging only.
        sentimentOf: sentimentOf
    };
})();
