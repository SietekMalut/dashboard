# Panduan Mengaktifkan Login (Supabase)

Aplikasi tetap bisa dipakai tanpa login selama `js/config.js` kosong (**mode lokal**).
Ikuti langkah ini untuk mengaktifkan akun, persetujuan super admin, dan dashboard per user.

## 1. Buat proyek Supabase

1. Buka https://supabase.com dan buat proyek baru.
2. Tunggu sampai status proyek *Active*.
3. Masuk ke **SQL Editor** → **New query**, tempel seluruh isi `supabase/schema.sql`, lalu **Run**.
   (Aman diulang jika sudah pernah dijalankan.)

## 2. Matikan konfirmasi email

**Authentication → Providers → Email** → matikan **Confirm email** → **Save**.

Ini penting: pengguna **tidak perlu memasukkan email**. Aplikasi membuat email
teknis otomatis dari username (mis. `admin@example.com`) hanya untuk Supabase Auth;
email itu tidak pernah ditampilkan atau dipakai untuk mengirim pesan.

## 3. Izinkan alamat aplikasi

**Authentication → URL Configuration**:

- **Site URL**: `https://sietekmalut.github.io/dashboard/`
- **Redirect URLs**: tambahkan `https://sietekmalut.github.io/dashboard/**`

## 4. Isi kredensial

**Project Settings → API**, salin:

- **Project URL** → `SUPABASE_URL`
- **anon / public key** → `SUPABASE_ANON_KEY`

ke dalam `js/config.js`:

```js
window.APP_CONFIG = {
    SUPABASE_URL: 'https://xxxx.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOi...',
    FORCE_LOCAL_MODE: false
};
```

> `anon key` sengaja public dan aman disimpan di repo. **Jangan pernah** memasukkan
> `service_role` key — itu menembus RLS.

Commit & push agar GitHub Pages ikut ter-update (versi aset sudah `v=13`).

## 5. Daftarkan super admin pertama

1. Buka situs → klik **Daftar** → isi username `admin` dan password kuat.
2. Username: 3–20 karakter, huruf kecil, angka, atau `_` (tanpa spasi, tanpa `@`).
3. Akun baru pasti berstatus **menunggu persetujuan** — ini normal.
4. Di **SQL Editor** Supabase, jalankan:

```sql
update public.profiles
set role = 'super_admin', approved = true
where username = 'admin';
```

5. Klik **Keluar** di aplikasi, lalu login lagi sebagai `admin`.
   Tombol **Admin** akan muncul di header dashboard.

## 6. Pakai halaman Admin

Super admin melihat semua akun yang mendaftar, lalu bisa:

- **Setujui** → akun langsung bisa login dan melihat dashboardnya.
- **Tolak** → akun tetap tidak bisa masuk.
- Mengubah peran antara **User** dan **Super Admin**.

Akun yang belum disetujui melihat layar “Menunggu persetujuan super admin” dan
tidak bisa membuka dashboard sama sekali.

## Catatan data

Setiap akun memiliki dashboard sendiri yang tersimpan di tabel `user_dashboards`
dan dilindungi RLS — akun lain tidak bisa membacanya. Dashboard lokal yang sudah
ada di browser akan diunggah ke akun saat login pertama kali dengan kredensial aktif.

Jika ingin sementara memakai mode lokal meski kredensial terisi, set
`FORCE_LOCAL_MODE: true` pada `js/config.js`.
