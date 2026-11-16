// Layout engine: user-controlled widget size, position and card style.
// Two arrangements are supported per dashboard:
//   - flow:   12-column responsive grid, widgets reorder by dragging
//   - canvas: free 2D placement on top of the same 12 columns (wide screens only)
(function () {
    'use strict';

    const MIN_W = 1;
    const MAX_W = 12;
    const MIN_H = 140;
    const MAX_H = 1600;
    const DEFAULT_W = 4;
    const SNAP_Y = 8; // canvas vertical snap, in pixels

    const GAP_PX = { compact: 12, normal: 24, loose: 40 };
    const GAP_VALUES = ['compact', 'normal', 'loose'];

    // Accent palette used by the per-widget style picker.
    const ACCENTS = {
        default: '#bb86fc',
        blue: '#64b5f6',
        green: '#81c784',
        amber: '#ffb74d',
        pink: '#f06292',
        red: '#e57373',
        teal: '#4db6ac'
    };

    const STYLE_DEFAULTS = {
        accent: 'default',
        theme: 'default',
        density: 'normal',
        align: 'left'
    };

    const THEMES = ['default', 'outline', 'solid', 'minimal'];
    const DENSITIES = ['normal', 'compact'];
    const ALIGNS = ['left', 'center'];

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function oneOf(value, allowed, fallback) {
        return allowed.indexOf(value) !== -1 ? value : fallback;
    }

    const Layout = {
        MIN_W: MIN_W,
        MAX_W: MAX_W,
        MIN_H: MIN_H,
        MAX_H: MAX_H,
        SNAP_Y: SNAP_Y,
        ACCENTS: ACCENTS,
        GAP_VALUES: GAP_VALUES,

        defaults: function () {
            return { w: DEFAULT_W, h: 0, x: 0, y: 0 };
        },

        // Accepts anything (missing, partial, garbage, imported JSON) and returns a safe layout.
        normalize: function (layout) {
            const src = layout || {};

            let w = parseInt(src.w, 10);
            if (!isFinite(w)) w = DEFAULT_W;
            w = clamp(w, MIN_W, MAX_W);

            let h = parseInt(src.h, 10);
            if (!isFinite(h) || h <= 0) {
                h = 0; // 0 means "automatic": the card stretches with its content/row
            } else {
                h = clamp(h, MIN_H, MAX_H);
            }

            let x = parseInt(src.x, 10);
            if (!isFinite(x)) x = 0;
            x = clamp(x, 0, MAX_W - w); // a card can never hang off the right edge

            let y = parseInt(src.y, 10);
            if (!isFinite(y)) y = 0;
            y = clamp(y, 0, 20000);

            return { w: w, h: h, x: x, y: y };
        },

        // Visual style of one card. Unknown values fall back to the defaults.
        normalizeStyle: function (style) {
            const src = style || {};
            return {
                accent: oneOf(src.accent, Object.keys(ACCENTS), STYLE_DEFAULTS.accent),
                theme: oneOf(src.theme, THEMES, STYLE_DEFAULTS.theme),
                density: oneOf(src.density, DENSITIES, STYLE_DEFAULTS.density),
                align: oneOf(src.align, ALIGNS, STYLE_DEFAULTS.align)
            };
        },

        gapPx: function (gap) {
            return GAP_PX[oneOf(gap, GAP_VALUES, 'normal')];
        },

        // Columns actually used at the current viewport width, so a layout made on a
        // desktop stays readable on a tablet or phone instead of squeezing to 1/12.
        effectiveCols: function (w) {
            const cols = clamp(w, MIN_W, MAX_W);
            const vw = window.innerWidth;
            if (vw <= 600) return MAX_W;
            if (vw <= 992) return Math.max(6, cols);
            return cols;
        },

        // Writes the layout onto a .widget-cell element (and returns the normalised copy).
        applyCellSize: function (cell, layout) {
            const l = this.normalize(layout);
            cell.dataset.w = String(l.w);
            cell.dataset.h = String(l.h);
            cell.dataset.x = String(l.x);
            cell.dataset.y = String(l.y);
            cell.style.setProperty('--w', String(this.effectiveCols(l.w)));
            cell.style.setProperty('--x', String(l.x));
            cell.style.setProperty('--y', l.y + 'px');
            cell.style.height = l.h > 0 ? l.h + 'px' : '';
            return l;
        },

        // Writes the per-widget style onto the cell. CSS does the rest.
        applyCellStyle: function (cell, style) {
            const s = this.normalizeStyle(style);
            cell.dataset.accent = s.accent;
            cell.dataset.theme = s.theme;
            cell.dataset.density = s.density;
            cell.dataset.align = s.align;
            cell.style.setProperty('--widget-accent', ACCENTS[s.accent]);
            return s;
        },

        // Applies dashboard-level arrangement settings to the grid element.
        applyGrid: function (grid, dashboard) {
            const d = dashboard || {};
            grid.classList.toggle('free-canvas', !!d.canvas);
            GAP_VALUES.forEach(function (gap) {
                grid.classList.toggle('gap-' + gap, (d.gap || 'normal') === gap);
            });
        },

        // Turns a pointer position (while dragging the resize grip) into a size.
        sizeFromPointer: function (cellRect, pointerX, pointerY, gridWidth, opts) {
            const options = opts || {};
            const pitch = gridWidth / MAX_W;
            const maxW = options.free
                ? Math.max(MIN_W, MAX_W - (parseInt(options.x, 10) || 0))
                : MAX_W;
            const cols = clamp(Math.round((pointerX - cellRect.left) / pitch), MIN_W, maxW);

            const rawHeight = pointerY - cellRect.top;
            let h;
            if (options.free) {
                // A canvas card always gets a real height, otherwise its neighbours
                // would move whenever the content changes.
                h = clamp(Math.round(rawHeight), MIN_H, MAX_H);
            } else {
                // Dragging above the minimum height switches the card back to automatic height.
                h = rawHeight > MIN_H * 0.6 ? clamp(Math.round(rawHeight), MIN_H, MAX_H) : 0;
            }

            return { w: cols, h: h };
        },

        // Greedy row packing. Returns { widgetId: {x, y} } without touching the widgets.
        pack: function (widgets, heights, gap) {
            const gapPx = typeof gap === 'number' ? gap : GAP_PX.normal;
            const positions = {};
            let x = 0;
            let y = 0;
            let rowHeight = 0;

            (widgets || []).forEach(function (widget) {
                const layout = Layout.normalize(widget.layout);
                if (x > 0 && x + layout.w > MAX_W) {
                    x = 0;
                    y += rowHeight + gapPx;
                    rowHeight = 0;
                }

                positions[widget.id] = { x: x, y: y };

                const measured = heights && heights[widget.id] > 0 ? heights[widget.id] : 320;
                rowHeight = Math.max(rowHeight, measured);
                x += layout.w;

                if (x >= MAX_W) {
                    x = 0;
                    y += rowHeight + gapPx;
                    rowHeight = 0;
                }
            });

            return positions;
        },

        // Measured card heights for a grid, used by pack() when moving to the canvas.
        measureHeights: function (grid) {
            const heights = {};
            if (!grid) return heights;
            Array.prototype.forEach.call(grid.querySelectorAll('.widget-cell'), function (cell) {
                heights[cell.dataset.widgetId] = Math.ceil(cell.getBoundingClientRect().height);
            });
            return heights;
        },

        // The canvas is absolutely positioned, so its height has to be computed by hand.
        syncCanvasHeight: function (grid) {
            if (!grid) return;
            // Below 992px the CSS turns the canvas back into a stacked flow grid,
            // so any pixel height would be wrong there.
            if (!grid.classList.contains('free-canvas') || window.innerWidth <= 992) {
                grid.style.height = '';
                return;
            }

            const cells = grid.querySelectorAll('.widget-cell');
            if (cells.length === 0) {
                grid.style.height = '';
                return;
            }

            let bottom = 0;
            Array.prototype.forEach.call(cells, function (cell) {
                const rectBottom = cell.offsetTop + cell.offsetHeight;
                if (rectBottom > bottom) bottom = rectBottom;
            });

            grid.style.height = (bottom + 8) + 'px';
        }
    };

    App.Layout = Layout;

    const LayoutController = {
        enabled: false,
        grid: null,
        dashboardId: null,
        onReorder: null,
        onResize: null,
        onPlace: null,
        _abort: null,
        _drag: null,
        _resize: null,
        _resizeObserver: null,

        // Called on every render: re-binds the handlers to the current grid element.
        attach: function (opts) {
            this.detach();

            this.grid = opts.grid;
            this.dashboardId = opts.dashboardId;
            this.onReorder = opts.onReorder || null;
            this.onResize = opts.onResize || null;
            this.onPlace = opts.onPlace || null;

            this._abort = new AbortController();
            const signal = this._abort.signal;

            this.grid.addEventListener('pointerdown', (e) => this._onDown(e), { signal: signal });
            document.addEventListener('pointermove', (e) => this._onMove(e), { signal: signal });
            document.addEventListener('pointerup', (e) => this._onUp(e), { signal: signal });
            document.addEventListener('pointercancel', (e) => this._onUp(e), { signal: signal });

            this.setEnabled(this.enabled);
            this.observeCells();
        },

        // Keeps the canvas height right when feed content or fonts resize a card.
        observeCells: function () {
            if (this._resizeObserver) this._resizeObserver.disconnect();
            if (typeof ResizeObserver === 'undefined' || !this.grid) return;

            this._resizeObserver = new ResizeObserver(() => {
                App.Layout.syncCanvasHeight(this.grid);
            });

            const cells = this.grid.querySelectorAll('.widget-cell');
            Array.prototype.forEach.call(cells, (cell) => this._resizeObserver.observe(cell));
        },

        detach: function () {
            if (this._abort) {
                this._abort.abort();
                this._abort = null;
            }
            if (this._resizeObserver) {
                this._resizeObserver.disconnect();
                this._resizeObserver = null;
            }
            this.grid = null;
            this._clearInteractions();
        },

        setEnabled: function (enabled) {
            this.enabled = !!enabled;
            if (!this.grid) return;
            this.grid.classList.toggle('layout-mode', this.enabled);
            if (!this.enabled) this._clearInteractions();
        },

        isFreeCanvas: function () {
            return !!this.grid &&
                this.grid.classList.contains('free-canvas') &&
                window.innerWidth > 992;
        },

        _clearInteractions: function () {
            if (this._drag && this._drag.cell) {
                this._drag.cell.classList.remove('dragging', 'free-dragging');
            }
            if (this._resize && this._resize.cell) {
                this._resize.cell.classList.remove('resizing');
            }
            this._drag = null;
            this._resize = null;
        },

        _onDown: function (e) {
            if (!this.enabled) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;

            const cell = e.target.closest ? e.target.closest('.widget-cell') : null;
            if (!cell || !this.grid.contains(cell)) return;

            if (e.target.closest('.widget-resize')) {
                this._startResize(e, cell);
            } else if (e.target.closest('a, button, input, select, textarea, .widget-actions')) {
                // Let the card's own controls (refresh, edit, delete, feed links) work
                // while layout mode is on; only the card body starts a drag.
                return;
            } else {
                this._startDrag(e, cell);
            }
        },

        _startDrag: function (e, cell) {
            e.preventDefault();

            const layout = App.Layout.normalize({
                w: cell.dataset.w,
                h: cell.dataset.h,
                x: cell.dataset.x,
                y: cell.dataset.y
            });
            const rect = cell.getBoundingClientRect();
            const gridRect = this.grid.getBoundingClientRect();

            this._drag = {
                cell: cell,
                free: this.isFreeCanvas(),
                moved: false,
                startX: e.clientX,
                startY: e.clientY,
                baseLeft: rect.left - gridRect.left,
                baseTop: rect.top - gridRect.top,
                w: layout.w,
                x: layout.x,
                y: layout.y,
                pitch: this.grid.clientWidth / App.Layout.MAX_W
            };

            cell.classList.add('dragging');
            if (this._drag.free) cell.classList.add('free-dragging');
        },

        _startResize: function (e, cell) {
            e.preventDefault();
            e.stopPropagation();

            const layout = App.Layout.normalize({
                w: cell.dataset.w,
                h: cell.dataset.h,
                x: cell.dataset.x,
                y: cell.dataset.y
            });

            this._resize = {
                cell: cell,
                free: this.isFreeCanvas(),
                rect: cell.getBoundingClientRect(),
                w: layout.w,
                h: layout.h,
                x: layout.x,
                y: layout.y
            };
            cell.classList.add('resizing');
        },

        _onMove: function (e) {
            if (this._resize) {
                this._moveResize(e);
                return;
            }
            if (this._drag) {
                this._moveDrag(e);
            }
        },

        _moveDrag: function (e) {
            const drag = this._drag;
            const cell = drag.cell;

            if (drag.free) {
                this._moveFreeDrag(e);
                return;
            }

            const under = document.elementFromPoint(e.clientX, e.clientY);
            if (!under || !this.grid.contains(under)) return;

            const target = under.closest('.widget-cell');

            if (!target || target === cell) {
                // Pointer is over the grid's empty space: park the card at the end.
                if (this.grid.lastElementChild !== cell) {
                    this.grid.appendChild(cell);
                    drag.moved = true;
                }
                return;
            }

            const rect = target.getBoundingClientRect();
            const inRow = e.clientY >= rect.top && e.clientY <= rect.bottom;
            const insertAfter = inRow
                ? e.clientX > rect.left + rect.width / 2
                : e.clientY > rect.top + rect.height / 2;

            if (insertAfter) {
                if (target.nextElementSibling !== cell) {
                    this.grid.insertBefore(cell, target.nextElementSibling);
                    drag.moved = true;
                }
            } else if (target.previousElementSibling !== cell) {
                this.grid.insertBefore(cell, target);
                drag.moved = true;
            }
        },

        // Free canvas: the card follows the pointer and snaps to the column grid.
        _moveFreeDrag: function (e) {
            const drag = this._drag;
            if (Math.abs(e.clientX - drag.startX) > 3 || Math.abs(e.clientY - drag.startY) > 3) {
                drag.moved = true;
            }

            const pitch = drag.pitch > 0 ? drag.pitch : this.grid.clientWidth / App.Layout.MAX_W;
            const left = drag.baseLeft + (e.clientX - drag.startX);
            const top = drag.baseTop + (e.clientY - drag.startY);

            const x = clamp(Math.round(left / pitch), 0, App.Layout.MAX_W - drag.w);
            const y = Math.max(0, Math.round(top / App.Layout.SNAP_Y) * App.Layout.SNAP_Y);

            drag.x = x;
            drag.y = y;
            drag.cell.dataset.x = String(x);
            drag.cell.dataset.y = String(y);
            drag.cell.style.setProperty('--x', String(x));
            drag.cell.style.setProperty('--y', y + 'px');

            App.Layout.syncCanvasHeight(this.grid);
        },

        _moveResize: function (e) {
            const state = this._resize;
            const size = App.Layout.sizeFromPointer(
                state.rect,
                e.clientX,
                e.clientY,
                this.grid.clientWidth,
                { free: state.free, x: state.x }
            );
            state.w = size.w;
            state.h = size.h;
            App.Layout.applyCellSize(state.cell, {
                w: state.w,
                h: state.h,
                x: state.x,
                y: state.y
            });
            App.Layout.syncCanvasHeight(this.grid);
        },

        _onUp: function () {
            if (this._resize) {
                const state = this._resize;
                state.cell.classList.remove('resizing');
                this._resize = null;
                if (this.onResize) {
                    this.onResize(state.cell.dataset.widgetId, {
                        w: state.w,
                        h: state.h,
                        x: state.x,
                        y: state.y
                    });
                }
                App.Layout.syncCanvasHeight(this.grid);
                return;
            }

            if (this._drag) {
                const drag = this._drag;
                const cell = drag.cell;
                cell.classList.remove('dragging', 'free-dragging');
                this._drag = null;

                if (drag.free) {
                    if (drag.moved && this.onPlace) {
                        this.onPlace(cell.dataset.widgetId, { x: drag.x, y: drag.y });
                    }
                    App.Layout.syncCanvasHeight(this.grid);
                    return;
                }

                if (drag.moved && this.onReorder) {
                    const ids = Array.prototype.map.call(
                        this.grid.querySelectorAll('.widget-cell'),
                        function (el) { return el.dataset.widgetId; }
                    );
                    this.onReorder(ids);
                }
            }
        }
    };

    App.LayoutController = LayoutController;
})();
