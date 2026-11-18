// Login / registration / pending-approval screens and the super-admin panel.
(function () {
    'use strict';

    if (!App.Auth) {
        console.error('Auth module missing. Auth UI disabled.');
        return;
    }

    let overlay = null;
    let formArea = null;
    let messageArea = null;
    let adminModal = null;

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function button(id, text, className) {
        const btn = el('button', className || 'btn auth-btn waves-effect', text);
        btn.type = 'button';
        if (id) btn.id = id;
        return btn;
    }

    function ensureOverlay() {
        if (overlay) return overlay;

        overlay = el('div', 'auth-screen');
        overlay.id = 'auth-screen';

        const card = el('div', 'auth-card');
        card.appendChild(el('div', 'auth-brand', 'Media Monitoring Dashboard'));

        const heading = el('h4', 'auth-heading', 'Masuk');
        heading.id = 'auth-heading';
        card.appendChild(heading);

        formArea = el('div', 'auth-form');
        formArea.id = 'auth-form-area';
        card.appendChild(formArea);

        messageArea = el('div', 'auth-message');
        messageArea.id = 'auth-message';
        card.appendChild(messageArea);

        overlay.appendChild(card);
        document.body.appendChild(overlay);
        return overlay;
    }

    function setMessage(text, isError) {
        if (!messageArea) return;
        messageArea.textContent = text || '';
        messageArea.classList.toggle('is-error', !!isError);
    }

    function inputField(id, label, type, placeholder) {
        const wrap = el('div', 'input-field auth-field');
        const input = el('input', 'validate');
        input.id = id;
        input.type = type || 'text';
        input.autocomplete = type === 'password' ? 'current-password' : 'username';
        if (placeholder) input.placeholder = placeholder;
        const labelEl = el('label', '', label);
        labelEl.setAttribute('for', id);
        wrap.appendChild(input);
        wrap.appendChild(labelEl);
        return wrap;
    }

    function linkButton(id, text) {
        const link = el('a', 'auth-link', text);
        link.id = id;
        link.href = '#!';
        return link;
    }

    function renderLogin() {
        ensureOverlay();
        document.getElementById('auth-heading').textContent = 'Masuk';
        formArea.innerHTML = '';
        setMessage('');

        const form = el('form', 'auth-form-inner');
        form.appendChild(inputField('auth-username', 'Username', 'text', 'mis. admin'));
        form.appendChild(inputField('auth-password', 'Password', 'password', ''));

        const submit = button('auth-submit', 'Masuk', 'btn auth-btn waves-effect');
        submit.type = 'submit';
        form.appendChild(submit);
        formArea.appendChild(form);

        const footer = el('div', 'auth-footer');
        footer.appendChild(el('span', '', 'Belum punya akun? '));
        footer.appendChild(linkButton('auth-goto-register', 'Daftar'));
        formArea.appendChild(footer);

        document.getElementById('auth-goto-register').onclick = (e) => {
            e.preventDefault();
            renderRegister();
        };

        form.onsubmit = async (e) => {
            e.preventDefault();
            const username = document.getElementById('auth-username').value;
            const password = document.getElementById('auth-password').value;
            submit.disabled = true;
            submit.textContent = 'Memeriksa…';
            setMessage('');
            try {
                await App.Auth.signIn(username, password);
                location.reload();
            } catch (error) {
                setMessage(error.message, true);
                submit.disabled = false;
                submit.textContent = 'Masuk';
            }
        };
    }

    function renderRegister() {
        ensureOverlay();
        document.getElementById('auth-heading').textContent = 'Daftar Akun';
        formArea.innerHTML = '';
        setMessage('');

        const form = el('form', 'auth-form-inner');
        form.appendChild(inputField('reg-username', 'Username', 'text', '3–20 karakter'));
        form.appendChild(inputField('reg-password', 'Password', 'password', 'minimal 6 karakter'));
        form.appendChild(inputField('reg-confirm', 'Ulangi Password', 'password', ''));
        form.appendChild(el('p', 'auth-hint',
            'Email tidak diperlukan. Akun baru menunggu persetujuan super admin sebelum bisa masuk.'));

        const submit = button('reg-submit', 'Daftar', 'btn auth-btn waves-effect');
        submit.type = 'submit';
        form.appendChild(submit);
        formArea.appendChild(form);

        const footer = el('div', 'auth-footer');
        footer.appendChild(el('span', '', 'Sudah punya akun? '));
        footer.appendChild(linkButton('auth-goto-login', 'Masuk'));
        formArea.appendChild(footer);

        document.getElementById('auth-goto-login').onclick = (e) => {
            e.preventDefault();
            renderLogin();
        };

        form.onsubmit = async (e) => {
            e.preventDefault();
            const username = document.getElementById('reg-username').value;
            const password = document.getElementById('reg-password').value;
            const confirm = document.getElementById('reg-confirm').value;

            if (password !== confirm) {
                setMessage('Password dan ulangi password tidak sama.', true);
                return;
            }
            submit.disabled = true;
            submit.textContent = 'Mendaftar…';
            setMessage('');
            try {
                const result = await App.Auth.signUp(username, password);
                // Never leave a pending account signed in.
                await App.Auth.signOut();
                renderPending(result.username);
            } catch (error) {
                setMessage(error.message, true);
                submit.disabled = false;
                submit.textContent = 'Daftar';
            }
        };
    }

    function renderPending(username) {
        ensureOverlay();
        document.getElementById('auth-heading').textContent = 'Menunggu Persetujuan';
        formArea.innerHTML = '';

        const box = el('div', 'auth-pending');
        box.appendChild(el('div', 'auth-pending-icon', 'hourglass_top'));
        box.appendChild(el('p', '',
            'Akun ' + (username ? '@' + username : 'Anda') + ' berhasil didaftarkan.'));
        box.appendChild(el('p', 'auth-hint',
            'Super admin harus menyetujui akun ini terlebih dahulu. Coba masuk lagi setelah disetujui.'));
        formArea.appendChild(box);

        const back = button('auth-back-login', 'Kembali ke Masuk', 'btn auth-btn waves-effect');
        back.onclick = renderLogin;
        formArea.appendChild(back);
        setMessage('');
    }

    function renderBlocked(username) {
        ensureOverlay();
        document.getElementById('auth-heading').textContent = 'Menunggu Persetujuan';
        formArea.innerHTML = '';

        const box = el('div', 'auth-pending');
        box.appendChild(el('div', 'auth-pending-icon', 'hourglass_top'));
        box.appendChild(el('p', '',
            'Akun ' + (username ? '@' + username : 'Anda') + ' belum disetujui super admin.'));
        box.appendChild(el('p', 'auth-hint',
            'Hubungi super admin untuk menyetujui akun ini, lalu coba masuk lagi.'));
        formArea.appendChild(box);

        const back = button('auth-back-login', 'Kembali ke Masuk', 'btn auth-btn waves-effect');
        back.onclick = renderLogin;
        formArea.appendChild(back);
        setMessage('');
    }

    function renderError(text) {
        ensureOverlay();
        document.getElementById('auth-heading').textContent = 'Tidak Bisa Masuk';
        formArea.innerHTML = '';
        formArea.appendChild(el('p', 'auth-hint', text || 'Terjadi kesalahan saat memuat akun.'));
        const back = button('auth-back-login', 'Coba Lagi', 'btn auth-btn waves-effect');
        back.onclick = renderLogin;
        formArea.appendChild(back);
    }

    async function renderAdminList() {
        const list = document.getElementById('admin-list');
        if (!list) return;
        list.textContent = 'Memuat daftar akun…';

        let profiles;
        try {
            profiles = await App.Auth.listProfiles();
        } catch (error) {
            list.textContent = 'Gagal memuat: ' + error.message;
            return;
        }

        list.innerHTML = '';
        if (!profiles.length) {
            list.appendChild(el('p', 'auth-hint', 'Belum ada akun terdaftar.'));
            return;
        }

        const table = el('table', 'admin-table');
        const head = el('tr');
        ['Username', 'Status', 'Peran', 'Aksi'].forEach(text => head.appendChild(el('th', '', text)));
        const thead = el('thead');
        thead.appendChild(head);
        table.appendChild(thead);

        const tbody = el('tbody');
        profiles.forEach(item => {
            const row = el('tr');

            const nameCell = el('td', 'admin-user', '@' + item.username);
            row.appendChild(nameCell);

            const statusCell = el('td');
            const statusClass = item.approved ? 'admin-status ok' : 'admin-status wait';
            statusCell.appendChild(el('span', statusClass, item.approved ? 'Disetujui' : 'Menunggu'));
            row.appendChild(statusCell);

            const roleCell = el('td');
            const select = el('select', 'admin-role');
            select.dataset.id = item.id;
            [['user', 'User'], ['super_admin', 'Super Admin']].forEach(pair => {
                const option = el('option', '', pair[1]);
                option.value = pair[0];
                if (item.role === pair[0]) option.selected = true;
                select.appendChild(option);
            });
            roleCell.appendChild(select);
            row.appendChild(roleCell);

            const actionCell = el('td', 'admin-actions');
            const toggle = button('', item.approved ? 'Tolak' : 'Setujui',
                'btn-flat admin-btn ' + (item.approved ? 'reject' : 'approve'));
            toggle.dataset.id = item.id;
            toggle.dataset.approved = item.approved ? 'false' : 'true';
            actionCell.appendChild(toggle);
            row.appendChild(actionCell);

            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        list.appendChild(table);

        list.querySelectorAll('.admin-btn').forEach(btn => {
            btn.onclick = async () => {
                btn.disabled = true;
                try {
                    await App.Auth.setApproval(btn.dataset.id, btn.dataset.approved === 'true');
                    await renderAdminList();
                } catch (error) {
                    setAdminNote('Gagal memperbarui: ' + error.message, true);
                    btn.disabled = false;
                }
            };
        });

        list.querySelectorAll('.admin-role').forEach(select => {
            select.onchange = async () => {
                select.disabled = true;
                try {
                    await App.Auth.setRole(select.dataset.id, select.value);
                    await renderAdminList();
                } catch (error) {
                    setAdminNote('Gagal mengubah peran: ' + error.message, true);
                    select.disabled = false;
                }
            };
        });

        if (window.M && M.FormSelect) {
            M.FormSelect.init(list.querySelectorAll('select'));
        }
    }

    function setAdminNote(text, isError) {
        const note = document.getElementById('admin-note');
        if (!note) return;
        note.textContent = text || '';
        note.classList.toggle('is-error', !!isError);
    }

    function ensureAdminModal() {
        if (adminModal) return adminModal;

        const modal = el('div', 'modal admin-modal');
        modal.id = 'modal-admin';

        const content = el('div', 'modal-content');
        content.appendChild(el('h4', '', 'Persetujuan Akun'));
        content.appendChild(el('p', 'auth-hint',
            'Setujui akun agar pengguna bisa membuka dashboard. Peran Super Admin dapat mengelola akun lain.'));

        const note = el('div', 'auth-message');
        note.id = 'admin-note';
        content.appendChild(note);

        const list = el('div', 'admin-list');
        list.id = 'admin-list';
        content.appendChild(list);
        modal.appendChild(content);

        const footer = el('div', 'modal-footer');
        const close = el('a', 'modal-close waves-effect waves-green btn-flat', 'Tutup');
        close.href = '#!';
        footer.appendChild(close);
        modal.appendChild(footer);

        document.body.appendChild(modal);
        adminModal = M.Modal.init(modal, {});
        return adminModal;
    }

    const AuthUI = {
        show: function (mode, value) {
            if (!App.Auth.enabled) return;
            ensureOverlay();
            overlay.classList.add('visible');
            document.body.classList.add('auth-locked');

            if (mode === 'register') renderRegister();
            else if (mode === 'pending') renderPending(value);
            else if (mode === 'blocked') renderBlocked(value);
            else if (mode === 'error') renderError(value);
            else renderLogin();
        },

        hide: function () {
            if (overlay) overlay.classList.remove('visible');
            document.body.classList.remove('auth-locked');
        },

        // Adds account controls to the dashboard header on every render.
        decorateHeader: function (container, account) {
            if (!App.Auth.enabled || !container || !account) return;

            const user = el('span', 'auth-user-label', '@' + account.username);
            user.title = account.role === 'super_admin' ? 'Super Admin' : 'User';
            container.insertBefore(user, container.firstChild);

            if (account.role === 'super_admin') {
                const admin = button('btn-admin', 'Admin', 'btn-outlined waves-effect');
                const icon = el('i', 'material-icons left', 'admin_panel_settings');
                admin.insertBefore(icon, admin.firstChild);
                admin.onclick = () => this.openAdmin();
                container.appendChild(admin);
            }

            const logout = button('btn-logout', 'Keluar', 'btn-outlined danger waves-effect');
            const icon = el('i', 'material-icons left', 'logout');
            logout.insertBefore(icon, logout.firstChild);
            logout.onclick = async () => {
                await App.Auth.signOut();
                location.reload();
            };
            container.appendChild(logout);
        },

        openAdmin: async function () {
            if (!App.Auth.enabled || !App.Auth.isSuperAdmin) return;
            const instance = ensureAdminModal();
            setAdminNote('');
            instance.open();
            await renderAdminList();
        }
    };

    App.AuthUI = AuthUI;
})();
