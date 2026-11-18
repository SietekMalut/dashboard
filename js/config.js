// Application configuration.
//
// Fill SUPABASE_URL and SUPABASE_ANON_KEY to enable accounts, super-admin
// approval and per-user cloud dashboards. Leave them empty to keep the app in
// local-only mode (everything stays in this browser, no login screen).
//
// The anon key is a PUBLIC browser key — safe to commit and ship to GitHub Pages.
// What protects the data is Row Level Security in Supabase (supabase/schema.sql).
// NEVER put the `service_role` key here: it bypasses RLS.
window.APP_CONFIG = {
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',

    // Force local-only mode even when credentials are filled (useful for demos).
    FORCE_LOCAL_MODE: false
};
