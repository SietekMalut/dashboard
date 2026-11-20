// Main App Logic
(function() {
    // Shared label used by the Add Widget menu and the add/edit modal title.
    function widgetTypeLabel(type) {
        const labels = {
            html: 'HTML Widget',
            rss: 'RSS Feed',
            'google-news': 'Google News',
            'github-repo': 'GitHub Repo',
            'news-analysis': 'Analisis Berita',
            'headline-ticker': 'Running Text'
        };
        return labels[type] || 'Widget';
    }

    async function initApp() {
        // When accounts are configured, nothing is rendered until the user is
        // signed in AND approved by a super admin.
        const auth = App.Auth;
        if (auth && auth.enabled) {
            const session = await auth.getSession();
            if (!session) {
                App.AuthUI.show('login');
                return;
            }

            const account = await auth.getProfile();
            if (!account || (!account.approved && account.role !== 'super_admin')) {
                await auth.signOut();
                App.AuthUI.show(
                    account ? 'blocked' : 'error',
                    account ? account.username : 'Profil akun belum terbentuk. Hubungi super admin.'
                );
                return;
            }

            // Cloud state wins over whatever was left in this browser.
            const cloudState = await auth.loadState();
            if (cloudState && Array.isArray(cloudState.dashboards)) {
                localStorage.setItem('dashboard_app_state', JSON.stringify(cloudState));
            }
            App.AuthUI.hide();
        }

        // Initialize Dashboard Manager
        App.DashboardManager.init();

        // Check for config URL
        const urlParams = new URLSearchParams(window.location.search);
        const configUrl = (window.App && window.App.demoConfigUrl) || urlParams.get('config');

        if (configUrl) {
            const success = await App.DashboardManager.loadFromUrl(configUrl);
            if (!success) {
                M.toast({html: 'Failed to load configuration from URL'});
            }
        }

        // Initial Render
        renderUI();

        // Initialize Materialize components that are static
        M.Modal.init(document.querySelectorAll('.modal'), {});
        // M.FloatingActionButton.init(document.querySelectorAll('.fixed-action-btn'), {}); // Removed
        M.FormSelect.init(document.querySelectorAll('select'), {});

        // Event Listeners
        setupEventListeners();

        // Re-apply responsive widths when the window is resized
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                document.querySelectorAll('.widget-cell').forEach(cell => {
                    App.Layout.applyCellSize(cell, {
                        w: cell.dataset.w,
                        h: cell.dataset.h,
                        x: cell.dataset.x,
                        y: cell.dataset.y
                    });
                });
                App.Layout.syncCanvasHeight(document.getElementById('widget-grid'));
            }, 150);
        });
    }

    function renderUI() {
        renderTabs();
        renderWidgets();
    }

    function renderTabs() {
        const tabsContainer = document.getElementById('dashboard-tabs');
        tabsContainer.innerHTML = '';

        const dashboards = App.DashboardManager.getDashboards();
        const activeDashboard = App.DashboardManager.getActiveDashboard();

        dashboards.forEach(dashboard => {
            const li = document.createElement('li');
            li.className = 'tab col s3';

            const a = document.createElement('a');
            a.href = `#${dashboard.id}`;
            a.textContent = dashboard.name;
            a.onclick = (e) => {
                e.preventDefault();
                App.DashboardManager.setActiveDashboard(dashboard.id);
                renderWidgets(); // Re-render widgets for the new dashboard
            };

            if (activeDashboard && dashboard.id === activeDashboard.id) {
                a.className = 'active';
            }

            li.appendChild(a);
            tabsContainer.appendChild(li);
        });

        // Re-init tabs to make the indicator work
        const tabsInstance = M.Tabs.init(tabsContainer, {});
    }

    function renderWidgets() {
        const contentContainer = document.getElementById('dashboard-content');
        contentContainer.innerHTML = '';

        const activeDashboard = App.DashboardManager.getActiveDashboard();
        if (!activeDashboard) {
            contentContainer.innerHTML = '<p class="center-align grey-text">No dashboard selected. Create one!</p>';
            if (App.Refresh) App.Refresh.start([]); // stop refreshing widgets that are no longer on screen
            return;
        }

        const toolbar = createLayoutToolbar();

        // Add a header for the dashboard with buttons
        const headerRow = document.createElement('div');
        headerRow.className = 'col s12 valign-wrapper';
        headerRow.style.marginBottom = '20px';
        headerRow.style.justifyContent = 'space-between';

        const title = document.createElement('h5');
        title.textContent = activeDashboard.name;
        title.className = 'left';
        title.style.margin = '0';

        // Auto-refresh status line, sits under the dashboard title.
        const refreshStatus = document.createElement('span');
        refreshStatus.className = 'refresh-status';
        refreshStatus.id = 'refresh-status';

        const titleBlock = document.createElement('div');
        titleBlock.className = 'dashboard-title-block';
        titleBlock.appendChild(title);
        titleBlock.appendChild(refreshStatus);

        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'right';
        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.gap = '10px';

        // Refresh Now Button
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'btn-outlined waves-effect refresh-btn';
        refreshBtn.innerHTML = '<i class="material-icons left">refresh</i>Refresh';
        refreshBtn.setAttribute('aria-label', 'Reload all feeds now');
        refreshBtn.title = 'Reload every feed now (they also refresh automatically)';
        refreshBtn.onclick = () => {
            if (!App.Refresh) return;
            App.Refresh.runAll('manual');
            M.toast({ html: 'Refreshing feeds…' });
        };

        // Add Widget Dropdown Trigger
        const addWidgetBtn = document.createElement('button');
        addWidgetBtn.className = 'btn-outlined waves-effect dropdown-trigger';
        addWidgetBtn.innerHTML = '<i class="material-icons left">add</i>Add Widget';
        addWidgetBtn.setAttribute('aria-label', 'Add new widget');
        addWidgetBtn.setAttribute('data-target', 'add-widget-dropdown');

        // Add Widget Dropdown Structure
        let dropdown = document.getElementById('add-widget-dropdown');
        if (!dropdown) {
            dropdown = document.createElement('ul');
            dropdown.id = 'add-widget-dropdown';
            dropdown.className = 'dropdown-content';

            const types = [
                { type: 'html', label: 'HTML Widget', icon: 'code' },
                { type: 'rss', label: 'RSS Feed', icon: 'rss_feed' },
                { type: 'google-news', label: 'Google News', icon: 'public' },
                { type: 'github-repo', label: 'GitHub Repo', icon: 'storage' },
                { type: 'news-analysis', label: 'Analisis Berita', icon: 'insert_chart_outlined' },
                { type: 'headline-ticker', label: 'Running Text', icon: 'view_headline' }
            ];

            types.forEach(item => {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = '#!';
                a.className = 'valign-wrapper';
                a.innerHTML = `<i class="material-icons">${item.icon}</i>${item.label}`;
                a.onclick = (e) => {
                    e.preventDefault();
                    openAddWidgetModal(item.type);
                };
                li.appendChild(a);
                dropdown.appendChild(li);
            });
            document.body.appendChild(dropdown);
        }

        // Delete Dashboard Button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-outlined danger waves-effect';
        deleteBtn.innerHTML = '<i class="material-icons left">delete</i>Delete Dashboard';
        deleteBtn.setAttribute('aria-label', 'Delete current dashboard');
        deleteBtn.onclick = () => {
            if (confirm(`Are you sure you want to delete "${activeDashboard.name}"?`)) {
                App.DashboardManager.removeDashboard(activeDashboard.id);
                renderUI();
            }
        };

        // Layout Mode Toggle
        const layoutBtn = document.createElement('button');
        layoutBtn.className = 'btn-outlined waves-effect';
        layoutBtn.innerHTML = '<i class="material-icons left">dashboard_customize</i>Layout';
        layoutBtn.setAttribute('aria-label', 'Toggle layout editing mode');
        layoutBtn.setAttribute('aria-pressed', 'false');
        layoutBtn.title = 'Arrange widgets: grid or free canvas, sizes, gaps and style';

        // Reset Layout Button (only visible while editing the layout)
        const resetBtn = document.createElement('button');
        resetBtn.className = 'btn-outlined waves-effect';
        resetBtn.innerHTML = '<i class="material-icons left">restart_alt</i>Reset';
        resetBtn.style.display = 'none';
        resetBtn.setAttribute('aria-label', 'Reset the whole layout');
        resetBtn.title = 'Back to the default grid, sizes, positions and spacing';
        resetBtn.onclick = () => {
            App.DashboardManager.resetLayout(activeDashboard.id);
            renderWidgets();
            M.toast({ html: 'Layout reset to default' });
        };

        const applyLayoutModeUI = () => {
            const enabled = App.LayoutController.enabled;
            layoutBtn.classList.toggle('active', enabled);
            layoutBtn.setAttribute('aria-pressed', String(enabled));
            resetBtn.style.display = enabled ? 'inline-flex' : 'none';
            if (toolbar) {
                toolbar.classList.toggle('open', enabled);
                syncLayoutToolbar(toolbar, activeDashboard);
            }
        };

        layoutBtn.onclick = () => {
            App.LayoutController.setEnabled(!App.LayoutController.enabled);
            applyLayoutModeUI();
            M.toast({
                html: App.LayoutController.enabled
                    ? 'Layout mode: drag cards, resize from the corner, or switch to Free canvas'
                    : 'Layout saved'
            });
        };

        buttonsContainer.appendChild(refreshBtn);
        buttonsContainer.appendChild(addWidgetBtn);
        buttonsContainer.appendChild(layoutBtn);
        buttonsContainer.appendChild(resetBtn);
        buttonsContainer.appendChild(deleteBtn);
        if (App.AuthUI) App.AuthUI.decorateHeader(buttonsContainer, App.Auth.profile);

        headerRow.appendChild(titleBlock);
        headerRow.appendChild(buttonsContainer);
        contentContainer.appendChild(headerRow);
        contentContainer.appendChild(toolbar);

        // Initialize Dropdown after adding to DOM
        M.Dropdown.init(addWidgetBtn, {
            constrainWidth: false,
            coverTrigger: false
        });

        // Widget grid (flow grid or free canvas, controlled by the user)
        const grid = document.createElement('div');
        grid.className = 'widget-grid';
        grid.id = 'widget-grid';
        App.Layout.applyGrid(grid, activeDashboard);
        contentContainer.appendChild(grid);

        App.LayoutController.attach({
            grid: grid,
            dashboardId: activeDashboard.id,
            onReorder: (orderedIds) => {
                App.DashboardManager.reorderWidgets(activeDashboard.id, orderedIds);
            },
            onResize: (widgetId, layout) => {
                App.DashboardManager.setWidgetLayout(activeDashboard.id, widgetId, layout);
            },
            onPlace: (widgetId, position) => {
                App.DashboardManager.setWidgetLayout(activeDashboard.id, widgetId, position);
            }
        });
        bindLayoutToolbar(toolbar, grid);
        applyLayoutModeUI();

        if (App.Refresh) {
            App.Refresh.setStatusElement(refreshStatus);
        }

        if (activeDashboard.widgets.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'widget-empty center-align grey-text';
            emptyMsg.innerHTML = '<p>No widgets yet. Use “Add Widget” to create one.</p>';
            grid.appendChild(emptyMsg);
            if (App.Refresh) App.Refresh.start([]);
            return;
        }

        // Every rendered widget is handed to the auto-refresh scheduler.
        const widgetInstances = [];

        activeDashboard.widgets.forEach(widgetData => {
            try {
                const widget = App.WidgetRegistry.createWidget(
                    widgetData.type,
                    widgetData.id,
                    widgetData.title,
                    widgetData.config,
                    widgetData.layout,
                    widgetData.style
                );
                widgetInstances.push(widget);
                widget.render(grid);
            } catch (e) {
                console.error('Failed to render widget:', e);
            }
        });

        // The cards exist now, so the canvas can be measured and watched.
        App.Layout.syncCanvasHeight(grid);
        App.LayoutController.observeCells();

        if (App.Refresh) {
            App.Refresh.start(widgetInstances);
        }
    }

    // ---------------------------------------------------------------
    // Layout helpers: toolbar, canvas packing, DOM order
    // ---------------------------------------------------------------

    function createLayoutToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'layout-toolbar';
        toolbar.id = 'layout-toolbar';
        toolbar.innerHTML =
            '<div class="layout-toolbar-group">' +
                '<span class="layout-toolbar-label">Mode</span>' +
                '<button type="button" class="layout-chip waves-effect" data-canvas="false">Grid</button>' +
                '<button type="button" class="layout-chip waves-effect" data-canvas="true">Free</button>' +
            '</div>' +
            '<div class="layout-toolbar-group">' +
                '<span class="layout-toolbar-label">Gap</span>' +
                '<button type="button" class="layout-chip waves-effect" data-gap="compact">Tight</button>' +
                '<button type="button" class="layout-chip waves-effect" data-gap="normal">Normal</button>' +
                '<button type="button" class="layout-chip waves-effect" data-gap="loose">Roomy</button>' +
            '</div>' +
            '<button type="button" class="layout-chip layout-tidy waves-effect" id="layout-tidy">Tidy</button>' +
            '<button type="button" class="layout-chip layout-preset waves-effect" id="layout-preset-4x4" title="Arrange up to 16 widgets: 4 per row, 4 rows. Each card can still be resized.">4×4</button>' +
            '<span class="layout-toolbar-hint" id="layout-hint"></span>';
        return toolbar;
    }

    function syncLayoutToolbar(toolbar, dashboard) {
        if (!toolbar || !dashboard) return;
        const canvas = !!dashboard.canvas;
        const gap = dashboard.gap || 'normal';

        toolbar.querySelectorAll('[data-canvas]').forEach(btn => {
            btn.classList.toggle('active', (btn.dataset.canvas === 'true') === canvas);
        });
        toolbar.querySelectorAll('[data-gap]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.gap === gap);
        });

        const tidy = toolbar.querySelector('#layout-tidy');
        if (tidy) tidy.style.display = canvas ? 'inline-flex' : 'none';

        const hint = toolbar.querySelector('#layout-hint');
        if (hint) {
            hint.textContent = canvas
                ? (window.innerWidth > 992
                    ? 'Drag cards anywhere; 4×4 gives four per row. Resize from the corner.'
                    : 'Free canvas is shown as a normal grid on this screen width.')
                : 'Drag to reorder, resize from the corner, or use 4×4 for four cards per row.';
        }
    }

    function bindLayoutToolbar(toolbar, grid) {
        toolbar.querySelectorAll('[data-canvas]').forEach(btn => {
            btn.onclick = () => {
                const enabled = btn.dataset.canvas === 'true';
                setDashboardCanvas(enabled, grid, toolbar);
            };
        });

        toolbar.querySelectorAll('[data-gap]').forEach(btn => {
            btn.onclick = () => {
                const dashboard = App.DashboardManager.setDashboardSettings(
                    App.DashboardManager.getActiveDashboard().id,
                    { gap: btn.dataset.gap }
                );
                App.Layout.applyGrid(grid, dashboard);
                syncLayoutToolbar(toolbar, dashboard);
            };
        });

        const tidy = toolbar.querySelector('#layout-tidy');
        if (tidy) {
            tidy.onclick = () => {
                tidyCanvas(grid, toolbar);
                M.toast({ html: 'Cards packed into rows' });
            };
        }

        const preset = toolbar.querySelector('#layout-preset-4x4');
        if (preset) {
            preset.onclick = () => applyFourByFour(grid, toolbar);
        }
    }

    // Switches between the flow grid and the free canvas, without re-fetching feeds.
    function setDashboardCanvas(enabled, grid, toolbar) {
        const manager = App.DashboardManager;
        const dashboard = manager.getActiveDashboard();
        if (!dashboard) return;

        manager.setDashboardSettings(dashboard.id, { canvas: enabled });

        if (enabled) {
            ensureCanvasPositions(dashboard, grid);
        } else {
            // Keep the visual order of the canvas when falling back to a flow grid.
            manager.sortWidgetsByPosition(dashboard.id);
        }

        const current = manager.getActiveDashboard();
        App.Layout.applyGrid(grid, current);
        layoutCells(grid, current);
        syncLayoutToolbar(toolbar, current);
        App.LayoutController.observeCells();
    }

    // Gives every card a first free position when a dashboard is opened on the canvas.
    function ensureCanvasPositions(dashboard, grid) {
        if (!dashboard || dashboard.widgets.length < 2) return;

        const unplaced = dashboard.widgets.every(widget => {
            const layout = App.Layout.normalize(widget.layout);
            return layout.x === 0 && layout.y === 0;
        });
        if (!unplaced) return;

        const heights = App.Layout.measureHeights(grid);
        // A fresh canvas starts with the preferred four-per-row arrangement.
        const positions = App.Layout.pack(
            dashboard.widgets,
            heights,
            App.Layout.gapPx(dashboard.gap),
            4
        );

        dashboard.widgets.forEach(widget => {
            widget.layout = App.Layout.normalize(
                Object.assign({}, widget.layout, positions[widget.id])
            );
        });
        App.DashboardManager.save();
    }

    // Re-applies layout/style to the existing cards and puts the DOM in state order.
    function layoutCells(grid, dashboard) {
        if (!grid || !dashboard) return;

        const cells = {};
        grid.querySelectorAll('.widget-cell').forEach(cell => {
            cells[cell.dataset.widgetId] = cell;
        });

        dashboard.widgets.forEach(widget => {
            const cell = cells[widget.id];
            if (!cell) return;
            grid.appendChild(cell);
            App.Layout.applyCellSize(cell, widget.layout);
            App.Layout.applyCellStyle(cell, widget.style);
        });

        App.Layout.syncCanvasHeight(grid);
    }

    // Packs the canvas into tidy rows, keeping the current reading order.
    function tidyCanvas(grid, toolbar) {
        const manager = App.DashboardManager;
        const dashboard = manager.getActiveDashboard();
        if (!dashboard || !dashboard.canvas) return;

        manager.sortWidgetsByPosition(dashboard.id);
        const sorted = manager.getActiveDashboard();
        const heights = App.Layout.measureHeights(grid);
        const positions = App.Layout.pack(
            sorted.widgets,
            heights,
            App.Layout.gapPx(sorted.gap)
        );

        sorted.widgets.forEach(widget => {
            widget.layout = App.Layout.normalize(
                Object.assign({}, widget.layout, positions[widget.id])
            );
        });
        manager.save();
        layoutCells(grid, sorted);
        syncLayoutToolbar(toolbar, sorted);
    }

    // 4×4 preset: four quarter-width cards per row, four rows for 16 widgets.
    // Works in both Grid and Free mode; cards stay freely resizable afterwards.
    function applyFourByFour(grid, toolbar) {
        const manager = App.DashboardManager;
        const dashboard = manager.getActiveDashboard();
        if (!dashboard || !dashboard.widgets.length) {
            M.toast({ html: 'Add a widget first' });
            return;
        }

        const quarter = App.Layout.MAX_W / 4;
        dashboard.widgets.forEach(widget => {
            widget.layout = App.Layout.normalize(
                Object.assign({}, widget.layout, { w: quarter, h: 0 })
            );
        });
        manager.save();

        // Apply the new widths before measuring: narrower cards can get taller.
        layoutCells(grid, dashboard);
        const heights = App.Layout.measureHeights(grid);
        const positions = App.Layout.pack(
            dashboard.widgets,
            heights,
            App.Layout.gapPx(dashboard.gap),
            4
        );

        dashboard.widgets.forEach(widget => {
            widget.layout = App.Layout.normalize(
                Object.assign({}, widget.layout, positions[widget.id])
            );
        });
        manager.save();

        const current = manager.getActiveDashboard();
        layoutCells(grid, current);
        App.LayoutController.observeCells();
        syncLayoutToolbar(toolbar, current);
        M.toast({ html: '4×4 applied — drag the corner of any card to resize it' });
    }

    // Bottom edge of the current canvas, used to drop a new widget below everything.
    function canvasBottom(dashboard, grid) {
        if (!grid) return 0;
        let bottom = 0;
        const gap = App.Layout.gapPx(dashboard.gap);
        grid.querySelectorAll('.widget-cell').forEach(cell => {
            const edge = cell.offsetTop + cell.offsetHeight + gap;
            if (edge > bottom) bottom = edge;
        });
        return Math.round(bottom);
    }

    function setupEventListeners() {
        // Accent swatches in the widget modal
        document.querySelectorAll('#widget-accent-swatches .accent-swatch').forEach(btn => {
            btn.addEventListener('click', () => setActiveAccent(btn.dataset.accent));
        });

        // New Dashboard
        const modalAddDashboard = M.Modal.getInstance(document.getElementById('modal-add-dashboard'));
        document.getElementById('btn-add-dashboard').addEventListener('click', () => {
            document.getElementById('new-dashboard-name').value = '';
            modalAddDashboard.open();
        });

        document.getElementById('confirm-add-dashboard').addEventListener('click', () => {
            const name = document.getElementById('new-dashboard-name').value.trim();
            if (name) {
                App.DashboardManager.addDashboard(name);
                renderUI();
            }
        });

        // Add/Edit Widget Confirmation
        document.getElementById('confirm-add-widget').addEventListener('click', (e) => {
            const modal = document.getElementById('modal-add-widget');
            const type = modal.getAttribute('data-selected-type');
            const widgetId = modal.getAttribute('data-widget-id');
            if (!type) return;

            const title = document.getElementById('widget-title').value.trim();
            const widthEl = document.getElementById('widget-layout-width');
            const widthValue = widthEl ? parseInt(widthEl.value, 10) : NaN;
            const layoutPatch = { w: isFinite(widthValue) ? widthValue : App.Layout.defaults().w };
            const style = readWidgetStyle();
            let config = {};

            if (type === 'html') {
                config.content = document.getElementById('html-content').value;
            } else if (type === 'rss') {
                config.url = document.getElementById('rss-url').value.trim();
                config.maxItems = document.getElementById('rss-max-items').value;
                config.filterDays = document.getElementById('rss-filter-days').value;
                config.showDescription = document.getElementById('rss-show-desc').checked;
                config.showDate = document.getElementById('rss-show-date').checked;
            } else if (type === 'google-news') {
                config.query = document.getElementById('google-news-query').value.trim();
                config.maxItems = document.getElementById('google-news-max-items').value;
                config.filterDays = document.getElementById('google-news-filter-days').value;
                config.showDescription = document.getElementById('google-news-show-desc').checked;
                config.showDate = document.getElementById('google-news-show-date').checked;
            } else if (type === 'github-repo') {
                config.repoUrl = document.getElementById('github-repo-url').value.trim();
                config.updateType = document.getElementById('github-update-type').value;
                config.maxItems = document.getElementById('github-max-items').value;
                config.filterDays = document.getElementById('github-filter-days').value;
                config.showDescription = document.getElementById('github-show-desc').checked;
                config.showDate = document.getElementById('github-show-date').checked;
            } else if (type === 'news-analysis') {
                config.mode = document.getElementById('analysis-mode').value;
                config.dashboardName = document.getElementById('analysis-dashboard-name').value.trim() || 'Berita Lokal';
                config.days = document.getElementById('analysis-days').value || 7;
                if (App.NewsAnalysis) App.NewsAnalysis.invalidate();
            } else if (type === 'headline-ticker') {
                const tickerSources = readTickerSources();
                config.sourceMode = tickerSources.sourceMode;
                config.widgetIds = tickerSources.widgetIds;
                config.dashboardName = document.getElementById('ticker-dashboard-name').value.trim() || 'Berita Lokal';
                config.secondsPerHeadline = document.getElementById('ticker-speed').value || 12;
                config.fontSizePx = document.getElementById('ticker-font-size').value || 21;
                if (App.NewsAnalysis) App.NewsAnalysis.invalidate();
            }

            if (widgetId) {
                const activeDashboard = App.DashboardManager.getActiveDashboard();
                if (activeDashboard) {
                    App.DashboardManager.updateWidget(activeDashboard.id, widgetId, title, config, layoutPatch, style);
                }
                modal.removeAttribute('data-widget-id');
                document.getElementById('confirm-add-widget').textContent = 'Add';
            } else {
                const added = App.DashboardManager.addWidgetToCurrent(type, title, config, { w: layoutPatch.w, h: 0 }, style);
                const activeDashboard = App.DashboardManager.getActiveDashboard();

                // On a free canvas a new card is dropped below everything else.
                if (added && activeDashboard && activeDashboard.canvas) {
                    const grid = document.getElementById('widget-grid');
                    App.DashboardManager.setWidgetLayout(activeDashboard.id, added.id, {
                        x: 0,
                        y: canvasBottom(activeDashboard, grid)
                    });
                }
            }
            renderWidgets();
        });

        // Import / Export
        document.getElementById('btn-export').addEventListener('click', (e) => {
            e.preventDefault();
            App.DashboardManager.exportState();
        });

        document.getElementById('btn-import').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('file-import').click();
        });

        document.getElementById('file-import').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            App.Storage.importState(file)
                .then(newState => {
                    if (App.DashboardManager.importState(newState)) {
                        M.toast({html: 'Import successful!'});
                        renderUI();
                    } else {
                        M.toast({html: 'Invalid import file.'});
                    }
                })
                .catch(err => {
                    console.error(err);
                    M.toast({html: 'Error importing file.'});
                });

            // Reset input
            e.target.value = '';
        });

        // Widget Delete (Event Delegation)
        document.getElementById('dashboard-content').addEventListener('widget-delete', (e) => {
            const widgetId = e.detail.widgetId;
            const activeDashboard = App.DashboardManager.getActiveDashboard();
            if (activeDashboard && confirm('Delete this widget?')) {
                App.DashboardManager.removeWidget(activeDashboard.id, widgetId);
                renderWidgets();
            }
        });

        // Widget Edit (Event Delegation)
        document.getElementById('dashboard-content').addEventListener('widget-edit', (e) => {
            const widgetId = e.detail.widgetId;
            const activeDashboard = App.DashboardManager.getActiveDashboard();
            if (!activeDashboard) return;

            const widget = activeDashboard.widgets.find(w => w.id === widgetId);
            if (!widget) return;

            openAddWidgetModal(widget.type);

            const modalEl = document.getElementById('modal-add-widget');
            modalEl.setAttribute('data-widget-id', widgetId);

            // Update title to indicate editing
            modalEl.querySelector('h4').textContent = `Edit ${widgetTypeLabel(widget.type)}`;
            document.getElementById('confirm-add-widget').textContent = 'Save';

            // Populate fields
            document.getElementById('widget-title').value = widget.title || '';

            // Width selector: snap the stored layout to the closest preset
            const presets = [3, 4, 6, 8, 12];
            const currentWidth = App.Layout.normalize(widget.layout).w;
            const nearest = presets.reduce((best, p) =>
                Math.abs(p - currentWidth) < Math.abs(best - currentWidth) ? p : best, presets[0]);
            const widthSelect = document.getElementById('widget-layout-width');
            if (widthSelect) {
                widthSelect.value = String(nearest);
                M.FormSelect.init(widthSelect);
            }

            populateWidgetStyle(widget.style);

            M.updateTextFields(); // Materialize helper to update labels

            if (widget.type === 'html') {
                document.getElementById('html-content').value = widget.config.content || '';
                M.textareaAutoResize(document.getElementById('html-content'));
            } else if (widget.type === 'rss') {
                document.getElementById('rss-url').value = widget.config.url || '';
                document.getElementById('rss-max-items').value = widget.config.maxItems || '';
                document.getElementById('rss-filter-days').value = widget.config.filterDays || '';
                document.getElementById('rss-show-desc').checked = widget.config.showDescription !== false;
                document.getElementById('rss-show-date').checked = widget.config.showDate === true;
            } else if (widget.type === 'google-news') {
                document.getElementById('google-news-query').value = widget.config.query || '';
                document.getElementById('google-news-max-items').value = widget.config.maxItems || '';
                document.getElementById('google-news-filter-days').value = widget.config.filterDays || '';
                document.getElementById('google-news-show-desc').checked = widget.config.showDescription !== false;
                document.getElementById('google-news-show-date').checked = widget.config.showDate === true;
            } else if (widget.type === 'github-repo') {
                document.getElementById('github-repo-url').value = widget.config.repoUrl || '';
                document.getElementById('github-update-type').value = widget.config.updateType || 'releases';
                document.getElementById('github-max-items').value = widget.config.maxItems || '';
                document.getElementById('github-filter-days').value = widget.config.filterDays || '';
                document.getElementById('github-show-desc').checked = widget.config.showDescription !== false;
                document.getElementById('github-show-date').checked = widget.config.showDate === true;
                M.FormSelect.init(document.getElementById('github-update-type'));
            } else if (widget.type === 'news-analysis') {
                document.getElementById('analysis-mode').value = widget.config.mode || 'headlines';
                document.getElementById('analysis-dashboard-name').value = widget.config.dashboardName || 'Berita Lokal';
                document.getElementById('analysis-days').value = widget.config.days || 7;
                M.FormSelect.init(document.getElementById('analysis-mode'));
                M.updateTextFields();
            } else if (widget.type === 'headline-ticker') {
                const mode = widget.config.sourceMode === 'widgets' && (widget.config.widgetIds || []).length
                    ? 'widgets' : 'dashboard';
                const radio = document.querySelector('input[name="ticker-source-mode"][value="' + mode + '"]');
                if (radio) radio.checked = true;
                document.getElementById('ticker-dashboard-name').value = widget.config.dashboardName || 'Berita Lokal';
                document.getElementById('ticker-speed').value = widget.config.secondsPerHeadline || 12;
                document.getElementById('ticker-font-size').value = widget.config.fontSizePx || 21;
                renderTickerSourceList(widget.config.widgetIds || []);
                toggleTickerSourceFields();
                M.updateTextFields();
            }
        });
    }

    // ---------------------------------------------------------------
    // Per-widget style form helpers
    // ---------------------------------------------------------------

    function setActiveAccent(accent) {
        const modal = document.getElementById('modal-add-widget');
        const swatches = document.querySelectorAll('#widget-accent-swatches .accent-swatch');
        let matched = false;

        swatches.forEach(btn => {
            const active = btn.dataset.accent === accent;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
            if (active) matched = true;
        });

        modal.setAttribute('data-accent', matched ? accent : 'default');
    }

    function setSelectValue(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = value;
        M.FormSelect.init(el);
    }

    function resetWidgetStyleFields() {
        setActiveAccent('default');
        setSelectValue('widget-card-style', 'default');
        setSelectValue('widget-density', 'normal');
        setSelectValue('widget-title-align', 'left');
    }

    function populateWidgetStyle(style) {
        const s = App.Layout.normalizeStyle(style);
        setActiveAccent(s.accent);
        setSelectValue('widget-card-style', s.theme);
        setSelectValue('widget-density', s.density);
        setSelectValue('widget-title-align', s.align);
    }

    function readWidgetStyle() {
        const modal = document.getElementById('modal-add-widget');
        const themeEl = document.getElementById('widget-card-style');
        const densityEl = document.getElementById('widget-density');
        const alignEl = document.getElementById('widget-title-align');
        return {
            accent: modal.getAttribute('data-accent') || 'default',
            theme: themeEl ? themeEl.value : 'default',
            density: densityEl ? densityEl.value : 'normal',
            align: alignEl ? alignEl.value : 'left'
        };
    }

    // Running-text source picker: either one named dashboard, or an explicit
    // set of RSS/Google News widgets from any dashboard (national + local mix).
    function tickerSourceMode() {
        const checked = document.querySelector('input[name="ticker-source-mode"]:checked');
        return checked ? checked.value : 'dashboard';
    }

    function toggleTickerSourceFields() {
        const mode = tickerSourceMode();
        const dashboardField = document.getElementById('ticker-dashboard-field');
        const widgetField = document.getElementById('ticker-widget-field');
        if (dashboardField) dashboardField.style.display = mode === 'widgets' ? 'none' : 'block';
        if (widgetField) widgetField.style.display = mode === 'widgets' ? 'block' : 'none';
    }

    function renderTickerSourceList(selectedIds) {
        const list = document.getElementById('ticker-widget-list');
        if (!list) return;
        list.innerHTML = '';

        const selected = new Set((selectedIds || []).map(String));
        const dashboards = (App.DashboardManager && App.DashboardManager.getDashboards()) || [];
        let count = 0;

        dashboards.forEach(dashboard => {
            const feeds = (dashboard.widgets || []).filter(widget =>
                widget && (widget.type === 'rss' || widget.type === 'google-news')
            );
            if (!feeds.length) return;

            const group = document.createElement('div');
            group.className = 'ht-source-group';
            const heading = document.createElement('div');
            heading.className = 'ht-source-group-title';
            heading.textContent = dashboard.name || '(tanpa nama)';
            group.appendChild(heading);

            feeds.forEach(widget => {
                const option = document.createElement('label');
                option.className = 'ht-source-option';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = String(widget.id);
                checkbox.checked = selected.has(String(widget.id));
                const text = document.createElement('span');
                text.textContent = widget.title ||
                    (widget.config && (widget.config.query || widget.config.url)) || widget.id;
                option.appendChild(checkbox);
                option.appendChild(text);
                group.appendChild(option);
                count += 1;
            });
            list.appendChild(group);
        });

        if (!count) {
            const note = document.createElement('p');
            note.className = 'na-config-note';
            note.textContent = 'Belum ada widget RSS / Google News. Tambahkan dulu feed di dashboard mana pun.';
            list.appendChild(note);
        }
    }

    function readTickerSources() {
        const mode = tickerSourceMode();
        const ids = [...document.querySelectorAll('#ticker-widget-list input:checked')]
            .map(input => input.value);
        return {
            sourceMode: mode === 'widgets' && ids.length ? 'widgets' : 'dashboard',
            widgetIds: ids
        };
    }

    function openAddWidgetModal(type) {
        const modalAddWidget = M.Modal.getInstance(document.getElementById('modal-add-widget'));
        const modalEl = document.getElementById('modal-add-widget');
        // Store selected type
        modalEl.setAttribute('data-selected-type', type);

        // Ensure we clear any previous edit state
        modalEl.removeAttribute('data-widget-id');
        document.getElementById('confirm-add-widget').textContent = 'Add';

        // Reset inputs
        document.getElementById('widget-title').value = '';
        const widthSelect = document.getElementById('widget-layout-width');
        if (widthSelect) {
            widthSelect.value = String(App.Layout.defaults().w);
            M.FormSelect.init(widthSelect);
        }
        resetWidgetStyleFields();
        document.getElementById('html-content').value = '';
        document.getElementById('rss-url').value = '';
        document.getElementById('google-news-query').value = '';
        document.getElementById('rss-max-items').value = '';
        document.getElementById('rss-filter-days').value = '';
        document.getElementById('rss-show-desc').checked = true;
        document.getElementById('rss-show-date').checked = false;
        document.getElementById('google-news-max-items').value = '';
        document.getElementById('google-news-filter-days').value = '';
        document.getElementById('google-news-show-desc').checked = true;
        document.getElementById('google-news-show-date').checked = false;
        document.getElementById('github-repo-url').value = '';
        document.getElementById('github-update-type').value = 'releases';
        document.getElementById('github-max-items').value = '';
        document.getElementById('github-filter-days').value = '';
        document.getElementById('github-show-desc').checked = true;
        document.getElementById('github-show-date').checked = false;
        M.FormSelect.init(document.getElementById('github-update-type'));
        document.getElementById('analysis-mode').value = 'headlines';
        document.getElementById('analysis-dashboard-name').value = 'Berita Lokal';
        document.getElementById('analysis-days').value = 7;
        M.FormSelect.init(document.getElementById('analysis-mode'));
        const dashboardRadio = document.querySelector('input[name="ticker-source-mode"][value="dashboard"]');
        if (dashboardRadio) dashboardRadio.checked = true;
        document.getElementById('ticker-dashboard-name').value = 'Berita Lokal';
        const tickerDashboard = App.DashboardManager.getActiveDashboard();
        const onNasional = tickerDashboard && typeof tickerDashboard.name === 'string' &&
            tickerDashboard.name.trim().toLowerCase() === 'berita nasional';
        document.getElementById('ticker-speed').value = onNasional ? 18 : 8;
        document.getElementById('ticker-font-size').value = 21;
        renderTickerSourceList([]);
        toggleTickerSourceFields();
        document.querySelectorAll('input[name="ticker-source-mode"]').forEach(radio => {
            radio.onchange = toggleTickerSourceFields;
        });

        // Show relevant config
        document.querySelectorAll('.widget-config').forEach(el => el.style.display = 'none');
        if (type === 'html') {
            document.getElementById('config-html').style.display = 'block';
        } else if (type === 'rss') {
            document.getElementById('config-rss').style.display = 'block';
        } else if (type === 'google-news') {
            document.getElementById('config-google-news').style.display = 'block';
        } else if (type === 'github-repo') {
            document.getElementById('config-github-repo').style.display = 'block';
        } else if (type === 'news-analysis') {
            document.getElementById('config-news-analysis').style.display = 'block';
        } else if (type === 'headline-ticker') {
            document.getElementById('config-headline-ticker').style.display = 'block';
        }

        // Update modal title
        modalEl.querySelector('h4').textContent = `Add ${widgetTypeLabel(type)}`;

        modalAddWidget.open();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
})();
