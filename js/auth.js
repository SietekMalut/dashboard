// Supabase-backed accounts, approval and per-user dashboard storage.
// With empty config this module is inert and the app keeps its local-only mode.
(function () {
    'use strict';

    const cfg = window.APP_CONFIG || {};
    const url = String(cfg.SUPABASE_URL || '').trim();
    const anonKey = String(cfg.SUPABASE_ANON_KEY || '').trim();
    const forcedLocal = cfg.FORCE_LOCAL_MODE === true;
    const hasSdk = !!(window.supabase && window.supabase.createClient);

    let client = null;
    let profile = null;
    let saveTimer = null;
    let saveFailed = false;

    if (!forcedLocal && url && anonKey && hasSdk) {
        try {
            client = window.supabase.createClient(url, anonKey, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            });
        } catch (error) {
            console.error('Supabase could not be initialized:', error);
        }
    } else if (!forcedLocal && (url || anonKey) && !hasSdk) {
        console.error('Supabase SDK failed to load; running in local mode.');
    }

    // The user never types an email. A deterministic technical address is derived
    // from the username so Supabase Auth can still use its email provider.
    function emailFor(username) {
        return normalizeUsername(username) + '@example.com';
    }

    function normalizeUsername(value) {
        return String(value || '').trim().toLowerCase();
    }

    function validUsername(value) {
        return /^[a-z0-9_]{3,20}$/.test(normalizeUsername(value));
    }

    function friendlyError(error) {
        const message = error && error.message ? String(error.message) : 'Terjadi kesalahan.';
        if (/invalid login credentials/i.test(message)) return 'Username atau password salah.';
        if (/user already registered/i.test(message)) return 'Username sudah terdaftar.';
        if (/password should be/i.test(message)) return 'Password terlalu pendek (minimal 6 karakter).';
        if (/email not confirmed/i.test(message)) return 'Email belum dikonfirmasi. Hubungi super admin.';
        if (/rate limit|too many/i.test(message)) return 'Terlalu banyak percobaan. Tunggu sebentar.';
        return message;
    }

    const Auth = {
        get enabled() { return !!client; },
        get profile() { return profile; },
        get isSuperAdmin() { return !!profile && profile.role === 'super_admin'; },

        normalizeUsername: normalizeUsername,
        validUsername: validUsername,

        async getSession() {
            if (!client) return null;
            try {
                const { data, error } = await client.auth.getSession();
                if (error) throw error;
                return data && data.session ? data.session : null;
            } catch (error) {
                console.error('Session check failed:', error);
                return null;
            }
        },

        async signUp(username, password) {
            if (!client) throw new Error('Login belum dikonfigurasi.');
            const name = normalizeUsername(username);
            if (!validUsername(name)) {
                throw new Error('Username 3–20 karakter: huruf kecil, angka, atau underscore.');
            }
            if (!password || password.length < 6) {
                throw new Error('Password minimal 6 karakter.');
            }

            const { data, error } = await client.auth.signUp({
                email: emailFor(name),
                password: password,
                options: { data: { username: name } }
            });
            if (error) throw new Error(friendlyError(error));
            return { username: name, session: data && data.session ? data.session : null };
        },

        async signIn(username, password) {
            if (!client) throw new Error('Login belum dikonfigurasi.');
            const { data, error } = await client.auth.signInWithPassword({
                email: emailFor(username),
                password: password
            });
            if (error) throw new Error(friendlyError(error));
            return data && data.session ? data.session : null;
        },

        async signOut() {
            profile = null;
            if (!client) return;
            try { await client.auth.signOut(); } catch (error) { console.error(error); }
        },

        // Returns the signed-in user's profile, including approval and role.
        async getProfile() {
            profile = null;
            const session = await this.getSession();
            if (!session) return null;

            const { data, error } = await client
                .from('profiles')
                .select('id, username, role, approved, created_at')
                .eq('id', session.user.id)
                .maybeSingle();

            if (error) {
                console.error('Profile load failed:', error);
                return null;
            }
            profile = data || null;
            return profile;
        },

        async loadState() {
            const session = await this.getSession();
            if (!session || !client) return null;
            const { data, error } = await client
                .from('user_dashboards')
                .select('state')
                .eq('user_id', session.user.id)
                .maybeSingle();

            if (error) {
                console.error('Cloud dashboard load failed:', error);
                return null;
            }
            return data && data.state && typeof data.state === 'object' ? data.state : null;
        },

        // Dashboard-manager calls save() often (drag, resize, add widget), so writes
        // are debounced. localStorage stays the immediate source of truth.
        scheduleSave(state) {
            if (!client) return;
            clearTimeout(saveTimer);
            const snapshot = JSON.parse(JSON.stringify(state));
            saveTimer = setTimeout(() => this.saveState(snapshot), 900);
        },

        async saveState(state) {
            if (!client) return;
            const session = await this.getSession();
            if (!session) return;

            const { error } = await client
                .from('user_dashboards')
                .upsert({
                    user_id: session.user.id,
                    state: state,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (error) {
                if (!saveFailed && window.M && M.toast) {
                    saveFailed = true;
                    M.toast({ html: 'Gagal menyimpan ke akun. Periksa koneksi lalu coba lagi.' });
                }
                console.error('Cloud dashboard save failed:', error);
                return;
            }
            saveFailed = false;
        },

        // --- Super-admin operations (RLS allows these only for super_admin) ---

        async listProfiles() {
            if (!client) return [];
            const { data, error } = await client
                .from('profiles')
                .select('id, username, role, approved, created_at')
                .order('created_at', { ascending: true });
            if (error) throw error;
            return data || [];
        },

        async setApproval(id, approved) {
            if (!client) throw new Error('Login belum dikonfigurasi.');
            const { error } = await client
                .from('profiles')
                .update({ approved: !!approved })
                .eq('id', id);
            if (error) throw error;
        },

        async setRole(id, role) {
            if (!client || (role !== 'user' && role !== 'super_admin')) {
                throw new Error('Peran tidak valid.');
            }
            const { error } = await client
                .from('profiles')
                .update({ role: role })
                .eq('id', id);
            if (error) throw error;
        }
    };

    App.Auth = Auth;
})();
