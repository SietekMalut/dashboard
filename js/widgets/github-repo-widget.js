(function() {
    class GithubRepoWidget extends App.Widgets.RssWidget {
        constructor(id, title, config, layout) {
            super(id, title, config, layout);
        }

        // Parses the configured repository and returns { user, repo }, or null.
        parseRepo() {
            const repoUrl = this.config.repoUrl;
            if (!repoUrl) return null;

            // Expected format: https://github.com/{user}/{repo} or just {user}/{repo}
            try {
                const cleanUrl = repoUrl.replace(/\/$/, '');
                let parts;
                if (cleanUrl.startsWith('http')) {
                    const urlObj = new URL(cleanUrl);
                    parts = urlObj.pathname.split('/').filter(p => p);
                } else {
                    parts = cleanUrl.split('/').filter(p => p);
                }

                if (parts.length >= 2) {
                    return { user: parts[0], repo: parts[1] };
                }
            } catch (e) {
                console.error('Error parsing GitHub URL', e);
            }
            return null;
        }

        buildAtomUrl() {
            const parsed = this.parseRepo();
            if (!parsed) return null;

            const base = `https://github.com/${parsed.user}/${parsed.repo}`;
            const updateType = this.config.updateType;

            if (updateType === 'commits') return `${base}/commits.atom`;
            if (updateType === 'tags') return `${base}/tags.atom`;
            return `${base}/releases.atom`; // default
        }

        resolveFeedUrl() {
            return this.buildAtomUrl();
        }

        missingUrlMessage() {
            return this.config.repoUrl
                ? 'Invalid Repository URL.'
                : 'No Repository URL provided.';
        }

        async render(container) {
            await super.render(container);
        }
    }

    App.Widgets.GithubRepoWidget = GithubRepoWidget;
})();
