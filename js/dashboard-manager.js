(function() {
    const DEFAULT_STATE = {
        dashboards: [],
        activeDashboardId: null
    };

    const DEFAULT_DASHBOARD_NAME = 'Berita Nasional';
    // Older versions created this name automatically; rename it once on load.
    const LEGACY_DEFAULT_NAME = 'Main Dashboard';

    const ANALYSIS_DASHBOARD_ID = 'analysis-7days';
    const ANALYSIS_DASHBOARD_NAME = 'Analisis Pemberitaan 7 Hari';
    // Stored on the state itself, so deleting the dashboard later never re-seeds it.
    const ANALYSIS_SEED_KEY = 'analysisDashboardSeeded';

    class DashboardManager {
        constructor() {
            this.state = DEFAULT_STATE;
        }

        init() {
            const loadedState = App.Storage.loadState();
            if (loadedState && loadedState.dashboards && loadedState.dashboards.length > 0) {
                this.state = loadedState;
                let changed = false;
                this.state.dashboards.forEach(dashboard => {
                    this.normalizeWidgetLayouts(dashboard);
                    if (this.ensureDashboardSettings(dashboard)) changed = true;
                });
                if (this.migrateLegacyDashboardName()) changed = true;
                if (this.ensureAnalysisDashboard()) changed = true;
                if (changed) this.save();
            } else {
                // Create a default dashboard if none exists
                this.addDashboard(DEFAULT_DASHBOARD_NAME);
                if (this.ensureAnalysisDashboard()) this.save();
            }
        }

        // Adds the built-in analysis dashboard exactly once. The active dashboard
        // is deliberately left untouched: returning users keep where they were.
        ensureAnalysisDashboard() {
            if (this.state[ANALYSIS_SEED_KEY]) return false;
            this.state[ANALYSIS_SEED_KEY] = true;

            // An imported configuration may already contain our fixed id.
            const existing = this.state.dashboards.find(d => d && d.id === ANALYSIS_DASHBOARD_ID);
            if (existing) return true;

            const widget = (id, title, mode, w, accent) => ({
                id: id,
                type: 'news-analysis',
                title: title,
                config: {
                    mode: mode,
                    dashboardName: 'Berita Lokal',
                    days: 7
                },
                layout: App.Layout.normalize({ w: w, h: 0, x: 0, y: 0 }),
                style: App.Layout.normalizeStyle({
                    accent: accent, theme: 'default', density: 'normal', align: 'left'
                })
            });

            this.state.dashboards.push({
                id: ANALYSIS_DASHBOARD_ID,
                name: ANALYSIS_DASHBOARD_NAME,
                canvas: false,
                gap: 'normal',
                widgets: [
                    widget('analysis-overview', 'Ringkasan Pemberitaan', 'overview', 12, 'blue'),
                    widget('analysis-headlines', 'Headline Terpopuler', 'headlines', 8, 'amber'),
                    widget('analysis-sentiment', 'Sentimen Pemberitaan', 'sentiment', 4, 'teal'),
                    widget('analysis-sources', 'Media Teraktif', 'sources', 12, 'green')
                ]
            });
            return true;
        }

        // Renames the old auto-created "Main Dashboard" for people who already have saved state.
        migrateLegacyDashboardName() {
            let changed = false;
            this.state.dashboards.forEach(dashboard => {
                if (dashboard && dashboard.name === LEGACY_DEFAULT_NAME) {
                    dashboard.name = DEFAULT_DASHBOARD_NAME;
                    changed = true;
                }
            });
            return changed;
        }

        // Guarantees every widget has a usable layout object (old configs and imports included).
        normalizeWidgetLayouts(dashboard) {
            if (!dashboard || !Array.isArray(dashboard.widgets)) return;
            dashboard.widgets.forEach(widget => {
                widget.layout = App.Layout.normalize(widget.layout);
                if (widget.style) widget.style = App.Layout.normalizeStyle(widget.style);
            });
        }

        // Adds the arrangement fields that older saved dashboards/imports do not have.
        ensureDashboardSettings(dashboard) {
            if (!dashboard || typeof dashboard !== 'object') return false;
            let changed = false;

            if (typeof dashboard.canvas !== 'boolean') {
                dashboard.canvas = false;
                changed = true;
            }
            if (App.Layout.GAP_VALUES.indexOf(dashboard.gap) === -1) {
                dashboard.gap = 'normal';
                changed = true;
            }
            return changed;
        }

        save() {
            App.Storage.saveState(this.state);
        }

        getDashboards() {
            return this.state.dashboards;
        }

        getActiveDashboard() {
            if (!this.state.activeDashboardId) return null;
            return this.state.dashboards.find(d => d.id === this.state.activeDashboardId);
        }

        setActiveDashboard(id) {
            if (this.state.dashboards.find(d => d.id === id)) {
                this.state.activeDashboardId = id;
                this.save();
            }
        }

        addDashboard(name) {
            const newDashboard = {
                id: App.Utils.generateUUID(),
                name: name,
                widgets: [],
                canvas: false,
                gap: 'normal'
            };
            this.state.dashboards.push(newDashboard);
            this.state.activeDashboardId = newDashboard.id; // Switch to new dashboard
            this.save();
            return newDashboard;
        }

        removeDashboard(id) {
            this.state.dashboards = this.state.dashboards.filter(d => d.id !== id);
            if (this.state.activeDashboardId === id) {
                // If we deleted the active one, switch to the first one available or null
                this.state.activeDashboardId = this.state.dashboards.length > 0 ? this.state.dashboards[0].id : null;
            }
            this.save();
        }

        addWidgetToCurrent(type, title, config, layout, style) {
            const activeDashboard = this.getActiveDashboard();
            if (activeDashboard) {
                const newWidget = {
                    id: App.Utils.generateUUID(),
                    type: type,
                    title: title,
                    config: config,
                    layout: App.Layout.normalize(layout),
                    style: App.Layout.normalizeStyle(style)
                };
                activeDashboard.widgets.push(newWidget);
                this.save();
                return newWidget;
            }
            return null;
        }

        updateWidget(dashboardId, widgetId, title, config, layoutPatch, style) {
            const dashboard = this.state.dashboards.find(d => d.id === dashboardId);
            if (dashboard) {
                const widget = dashboard.widgets.find(w => w.id === widgetId);
                if (widget) {
                    widget.title = title;
                    widget.config = config;
                    if (layoutPatch) {
                        widget.layout = App.Layout.normalize(
                            Object.assign({}, widget.layout, layoutPatch)
                        );
                    }
                    if (style) {
                        widget.style = App.Layout.normalizeStyle(style);
                    }
                    this.save();
                    return widget;
                }
            }
            return null;
        }

        // Persists a new widget order (array of widget ids, as they appear in the DOM).
        reorderWidgets(dashboardId, orderedIds) {
            const dashboard = this.state.dashboards.find(d => d.id === dashboardId);
            if (!dashboard || !Array.isArray(orderedIds)) return;

            const remaining = new Map(dashboard.widgets.map(w => [w.id, w]));
            const reordered = [];

            orderedIds.forEach(id => {
                if (remaining.has(id)) {
                    reordered.push(remaining.get(id));
                    remaining.delete(id);
                }
            });
            // Keep any widget that somehow was not in the DOM.
            remaining.forEach(w => reordered.push(w));

            dashboard.widgets = reordered;
            this.save();
        }

        setWidgetLayout(dashboardId, widgetId, layout) {
            const dashboard = this.state.dashboards.find(d => d.id === dashboardId);
            if (!dashboard) return null;

            const widget = dashboard.widgets.find(w => w.id === widgetId);
            if (!widget) return null;

            widget.layout = App.Layout.normalize(Object.assign({}, widget.layout, layout));
            this.save();
            return widget.layout;
        }

        // Arrangement fields of one dashboard: canvas mode, row gap.
        setDashboardSettings(dashboardId, patch) {
            const dashboard = this.state.dashboards.find(d => d.id === dashboardId);
            if (!dashboard || !patch) return null;

            if (typeof patch.canvas === 'boolean') dashboard.canvas = patch.canvas;
            if (patch.gap !== undefined) {
                dashboard.gap = App.Layout.GAP_VALUES.indexOf(patch.gap) !== -1
                    ? patch.gap
                    : dashboard.gap;
            }
            this.save();
            return dashboard;
        }

        // Used when leaving the free canvas so the flow order matches what the user saw.
        sortWidgetsByPosition(dashboardId) {
            const dashboard = this.state.dashboards.find(d => d.id === dashboardId);
            if (!dashboard) return;

            const indexed = dashboard.widgets.map((widget, index) => ({
                widget: widget,
                index: index,
                layout: App.Layout.normalize(widget.layout)
            }));

            indexed.sort((a, b) => {
                if (a.layout.y !== b.layout.y) return a.layout.y - b.layout.y;
                if (a.layout.x !== b.layout.x) return a.layout.x - b.layout.x;
                return a.index - b.index;
            });

            dashboard.widgets = indexed.map(entry => entry.widget);
            this.save();
        }

        resetLayout(dashboardId) {
            const dashboard = this.state.dashboards.find(d => d.id === dashboardId);
            if (!dashboard) return;
            const defaults = App.Layout.defaults();
            dashboard.widgets.forEach(widget => {
                widget.layout = Object.assign({}, defaults);
            });
            dashboard.canvas = false;
            dashboard.gap = 'normal';
            this.save();
        }

        removeWidget(dashboardId, widgetId) {
            const dashboard = this.state.dashboards.find(d => d.id === dashboardId);
            if (dashboard) {
                dashboard.widgets = dashboard.widgets.filter(w => w.id !== widgetId);
                this.save();
            }
        }

        importState(newState) {
            // Basic validation could go here
            if (newState && Array.isArray(newState.dashboards)) {
                this.state = newState;
                // Ensure activeDashboardId is valid
                if (!this.state.dashboards.find(d => d.id === this.state.activeDashboardId)) {
                     this.state.activeDashboardId = this.state.dashboards.length > 0 ? this.state.dashboards[0].id : null;
                }
                this.state.dashboards.forEach(d => {
                    this.normalizeWidgetLayouts(d);
                    this.ensureDashboardSettings(d);
                });
                this.save();
                return true;
            }
            return false;
        }

        async loadFromUrl(url) {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    console.error('Failed to fetch config:', response.statusText);
                    return false;
                }
                const config = await response.json();
                return this.importState(config);
            } catch (e) {
                console.error('Error loading config from URL:', e);
                return false;
            }
        }

        exportState() {
            App.Storage.exportState(this.state);
        }
    }

    App.DashboardManager = new DashboardManager();
})();
