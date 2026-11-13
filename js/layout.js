// Layout engine: user-controlled widget sizing (12-column grid) + drag & drop reordering.
(function () {
    'use strict';

    const MIN_W = 1;
    const MAX_W = 12;
    const MIN_H = 140;
    const MAX_H = 1600;
    const DEFAULT_W = 4;

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    const Layout = {
        MIN_W: MIN_W,
        MAX_W: MAX_W,
        MIN_H: MIN_H,
        MAX_H: MAX_H,

        defaults: function () {
            return { w: DEFAULT_W, h: 0 };
        },

        // Accepts anything (missing, partial, garbage, imported JSON) and returns a safe layout.
        normalize: function (layout) {
            const src = layout || {};

            let w = parseInt(src.w, 10);
            if (!isFinite(w)) w = DEFAULT_W;
            w = clamp(w, MIN_W, MAX_W);

            let h = parseInt(src.h, 10);
            if (!isFinite(h) || h <= 0) {
                h = 0; // 0 means "automatic": the card stretches with its row
            } else {
                h = clamp(h, MIN_H, MAX_H);
            }

            return { w: w, h: h };
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
            cell.style.setProperty('--w', String(this.effectiveCols(l.w)));
            cell.style.height = l.h > 0 ? l.h + 'px' : '';
            return l;
        },

        // Turns a pointer position (while dragging the resize grip) into a size.
        sizeFromPointer: function (cellRect, pointerX, pointerY, gridWidth) {
            const pitch = gridWidth / MAX_W;
            const cols = clamp(Math.round((pointerX - cellRect.left) / pitch), MIN_W, MAX_W);

            const rawHeight = pointerY - cellRect.top;
            // Dragging above the minimum height switches the card back to automatic height.
            const h = rawHeight > MIN_H * 0.6 ? clamp(Math.round(rawHeight), MIN_H, MAX_H) : 0;

            return { w: cols, h: h };
        }
    };

    App.Layout = Layout;

    const LayoutController = {
        enabled: false,
        grid: null,
        dashboardId: null,
        onReorder: null,
        onResize: null,
        _abort: null,
        _drag: null,
        _resize: null,

        // Called on every render: re-binds the handlers to the current grid element.
        attach: function (opts) {
            this.detach();

            this.grid = opts.grid;
            this.dashboardId = opts.dashboardId;
            this.onReorder = opts.onReorder || null;
            this.onResize = opts.onResize || null;

            this._abort = new AbortController();
            const signal = this._abort.signal;

            this.grid.addEventListener('pointerdown', (e) => this._onDown(e), { signal: signal });
            document.addEventListener('pointermove', (e) => this._onMove(e), { signal: signal });
            document.addEventListener('pointerup', (e) => this._onUp(e), { signal: signal });
            document.addEventListener('pointercancel', (e) => this._onUp(e), { signal: signal });

            this.setEnabled(this.enabled);
        },

        detach: function () {
            if (this._abort) {
                this._abort.abort();
                this._abort = null;
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

        _clearInteractions: function () {
            if (this._drag && this._drag.cell) {
                this._drag.cell.classList.remove('dragging');
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
            } else {
                this._startDrag(e, cell);
            }
        },

        _startDrag: function (e, cell) {
            e.preventDefault();
            this._drag = { cell: cell };
            cell.classList.add('dragging');
        },

        _startResize: function (e, cell) {
            e.preventDefault();
            e.stopPropagation();
            this._resize = {
                cell: cell,
                rect: cell.getBoundingClientRect(),
                w: parseInt(cell.dataset.w, 10) || DEFAULT_W,
                h: parseInt(cell.dataset.h, 10) || 0
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
            const cell = this._drag.cell;
            const under = document.elementFromPoint(e.clientX, e.clientY);
            if (!under || !this.grid.contains(under)) return;

            const target = under.closest('.widget-cell');

            if (!target || target === cell) {
                // Pointer is over the grid's empty space: park the card at the end.
                if (this.grid.lastElementChild !== cell) {
                    this.grid.appendChild(cell);
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
                }
            } else if (target.previousElementSibling !== cell) {
                this.grid.insertBefore(cell, target);
            }
        },

        _moveResize: function (e) {
            const state = this._resize;
            const size = App.Layout.sizeFromPointer(
                state.rect,
                e.clientX,
                e.clientY,
                this.grid.clientWidth
            );
            state.w = size.w;
            state.h = size.h;
            App.Layout.applyCellSize(state.cell, size);
        },

        _onUp: function () {
            if (this._resize) {
                const state = this._resize;
                state.cell.classList.remove('resizing');
                this._resize = null;
                if (this.onResize) {
                    this.onResize(state.cell.dataset.widgetId, { w: state.w, h: state.h });
                }
                return;
            }

            if (this._drag) {
                const cell = this._drag.cell;
                cell.classList.remove('dragging');
                this._drag = null;

                if (this.onReorder) {
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
