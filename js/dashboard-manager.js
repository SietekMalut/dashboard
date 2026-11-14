(function() {
    const DEFAULT_STATE = {
        dashboards: [],
        activeDashboardId: null
    };

    const DEFAULT_DASHBOARD_NAME = 'Berita Nasional';
    // Older versions created this name automatically; rename it once on load.
    const LEGACY_DEFAULT_NAME = 'Main Dashboard';

    class DashboardManager {
        constructor() {
            this.state = DEFAULT_STATE;
        }

        init() {
            const loadedState = App.Storage.loadState();
            if (loadedState && loadedState.dashboards && loadedState.dashboards.length > 0) {
                this.state = loadedState;
                this.state.dashboards.forEach(d => this.normalizeWidgetLayouts(d));
                this.migrateLegacyDashboardName();
            } else {
                // Create a default dashboard if none exists
                this.addDashboard(DEFAULT_DASHBOARD_NAME);
            }
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
            if (changed) this.save();
        }

        // Guarantees every widget has a usable layout object (old configs and imports included).
        normalizeWidgetLayouts(dashboard) {
            if (!dashboard || !Array.isArray(dashboard.widgets)) return;
            dashboard.widgets.forEach(widget => {
                widget.layout = App.Layout.normalize(widget.layout);
            });
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
                widgets: []
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

        addWidgetToCurrent(type, title, config, layout) {
            const activeDashboard = this.getActiveDashboard();
            if (activeDashboard) {
                const newWidget = {
                    id: App.Utils.generateUUID(),
                    type: type,
                    title: title,
                    config: config,
                    layout: App.Layout.normalize(layout)
                };
                activeDashboard.widgets.push(newWidget);
                this.save();
                return newWidget;
            }
            return null;
        }

        updateWidget(dashboardId, widgetId, title, config, layoutPatch) {
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

        resetLayout(dashboardId) {
            const dashboard = this.state.dashboards.find(d => d.id === dashboardId);
            if (!dashboard) return;
            const defaults = App.Layout.defaults();
            dashboard.widgets.forEach(widget => {
                widget.layout = Object.assign({}, defaults);
            });
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
                this.state.dashboards.forEach(d => this.normalizeWidgetLayouts(d));
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
