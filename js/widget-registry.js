(function() {
    App.WidgetRegistry = {
        createWidget: (type, id, title, config, layout, style) => {
            let WidgetClass;
            if (type === 'html') {
                WidgetClass = App.Widgets.HtmlWidget;
            } else if (type === 'rss') {
                WidgetClass = App.Widgets.RssWidget;
            } else if (type === 'google-news') {
                WidgetClass = App.Widgets.GoogleNewsWidget;
            } else if (type === 'github-repo') {
                WidgetClass = App.Widgets.GithubRepoWidget;
            } else if (type === 'news-analysis') {
                WidgetClass = App.Widgets.NewsAnalysisWidget;
            } else if (type === 'headline-ticker') {
                WidgetClass = App.Widgets.HeadlineTickerWidget;
            }

            if (!WidgetClass) {
                throw new Error(`Unknown widget type: ${type}`);
            }

            // Style is assigned after construction so widget subclasses keep their
            // existing (id, title, config, layout) constructors.
            const instance = new WidgetClass(id, title, config, layout);
            instance.style = App.Layout.normalizeStyle(style);
            return instance;
        },

        getAvailableTypes: () => {
            return ['html', 'rss', 'google-news', 'github-repo', 'news-analysis', 'headline-ticker'];
        }
    };
})();
