(function() {
    class BaseWidget {
        constructor(id, title, config, layout) {
            this.id = id;
            this.title = title || 'Untitled Widget';
            this.config = config || {};
            this.layout = App.Layout.normalize(layout);
        }

        render(container) {
            throw new Error("Method 'render' must be implemented.");
        }

        // Helper to create the standard card structure
        createCardElement() {
            const col = document.createElement('div');
            col.className = 'widget-cell'; // Width/height come from the user's layout
            col.dataset.widgetId = this.id;
            App.Layout.applyCellSize(col, this.layout);

            const card = document.createElement('div');
            card.className = 'card widget-card';

            const cardContent = document.createElement('div');
            cardContent.className = 'card-content';

            const cardTitle = document.createElement('span');
            cardTitle.className = 'card-title';

            // Drag handle (only visible in layout mode)
            const handle = document.createElement('i');
            handle.className = 'material-icons widget-handle';
            handle.textContent = 'drag_indicator';
            handle.title = 'Drag to move this widget';
            handle.setAttribute('aria-hidden', 'true');
            cardTitle.appendChild(handle);

            const titleText = document.createElement('span');
            titleText.className = 'widget-title-text';
            titleText.textContent = this.title;
            cardTitle.appendChild(titleText);

            const actions = document.createElement('span');
            actions.className = 'widget-actions';

            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-flat waves-effect waves-light widget-action-btn';
            deleteBtn.setAttribute('aria-label', `Delete ${this.title}`);
            deleteBtn.title = 'Delete widget';

            const deleteIcon = document.createElement('i');
            deleteIcon.className = 'material-icons white-text';
            deleteIcon.textContent = 'close';
            deleteBtn.appendChild(deleteIcon);

            deleteBtn.onclick = () => {
                // Dispatch a custom event for the dashboard manager to catch
                const event = new CustomEvent('widget-delete', { detail: { widgetId: this.id }, bubbles: true });
                col.dispatchEvent(event);
            };
            actions.appendChild(deleteBtn);

            // Edit button
            const editBtn = document.createElement('button');
            editBtn.className = 'btn-flat waves-effect waves-light widget-action-btn';
            editBtn.setAttribute('aria-label', `Edit ${this.title}`);
            editBtn.title = 'Edit widget';

            const editIcon = document.createElement('i');
            editIcon.className = 'material-icons white-text';
            editIcon.textContent = 'edit';
            editBtn.appendChild(editIcon);

            editBtn.onclick = () => {
                const event = new CustomEvent('widget-edit', { detail: { widgetId: this.id }, bubbles: true });
                col.dispatchEvent(event);
            };
            actions.appendChild(editBtn);

            cardTitle.appendChild(actions);

            const widgetBody = document.createElement('div');
            widgetBody.className = 'widget-body';

            cardContent.appendChild(cardTitle);
            cardContent.appendChild(widgetBody);
            card.appendChild(cardContent);

            // Resize grip (only visible in layout mode)
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'widget-resize';
            resizeHandle.title = 'Drag to resize this widget';
            resizeHandle.setAttribute('aria-hidden', 'true');
            card.appendChild(resizeHandle);

            col.appendChild(card);

            return { col, widgetBody };
        }
    }

    App.BaseWidget = BaseWidget;
})();
