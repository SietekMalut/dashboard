// Automatic feed refresh.
// Re-fetches every widget that has remote data on a fixed interval (default 15 minutes).
(function () {
    'use strict';

    const DEFAULT_MINUTES = 15;

    let widgets = [];
    let timer = null;
    let running = false;
    let lastRun = null;
    let intervalMinutes = DEFAULT_MINUTES;
    let visibilityBound = false;
    let statusEl = null;

    // Optional override for testing: ?refresh=0.5 (minutes)
    function readInterval() {
        const raw = new URLSearchParams(window.location.search).get('refresh');
        const minutes = parseFloat(raw);
        if (isFinite(minutes) && minutes >= 0.1) return minutes;
        return DEFAULT_MINUTES;
    }

    function formatTime(date) {
        try {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return date.toTimeString().slice(0, 5);
        }
    }

    function describeInterval() {
        if (intervalMinutes >= 1) {
            const rounded = Math.round(intervalMinutes * 10) / 10;
            return rounded === 1 ? 'every minute' : `every ${rounded} min`;
        }
        return `every ${Math.round(intervalMinutes * 60)} s`;
    }

    const Refresh = {
        get intervalMinutes() {
            return intervalMinutes;
        },

        get lastRun() {
            return lastRun;
        },

        setStatusElement(el) {
            statusEl = el;
            this.updateStatus();
        },

        // Called after every render, so a dashboard switch refreshes the right widgets.
        start(list) {
            widgets = Array.isArray(list) ? list.filter(Boolean) : [];
            intervalMinutes = readInterval();

            this.stop();
            timer = window.setInterval(() => this.runAll('interval'), intervalMinutes * 60 * 1000);

            if (!visibilityBound) {
                visibilityBound = true;
                document.addEventListener('visibilitychange', () => {
                    if (document.hidden) return;
                    // Background tabs get their timers throttled, so catch up on return.
                    const elapsed = lastRun ? Date.now() - lastRun.getTime() : Infinity;
                    if (elapsed >= intervalMinutes * 60 * 1000) this.runAll('visible');
                });
            }

            this.updateStatus();
        },

        stop() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        },

        async runAll(reason) {
            if (running || widgets.length === 0) return;

            running = true;
            document.body.classList.add('refreshing');

            try {
                const tasks = widgets
                    .filter(w => typeof w.refresh === 'function')
                    .map(w => {
                        try {
                            return Promise.resolve(w.refresh());
                        } catch (e) {
                            console.error('Widget refresh failed:', e);
                            return Promise.resolve();
                        }
                    });
                await Promise.allSettled(tasks);
            } finally {
                running = false;
                lastRun = new Date();
                document.body.classList.remove('refreshing');
                this.updateStatus();
            }
        },

        updateStatus() {
            if (!statusEl) return;
            if (lastRun) {
                statusEl.textContent = `Auto-refresh ${describeInterval()} · last update ${formatTime(lastRun)}`;
            } else {
                statusEl.textContent = `Auto-refresh ${describeInterval()}`;
            }
            statusEl.title = 'Feeds reload automatically in the background';
        }
    };

    App.Refresh = Refresh;
})();
