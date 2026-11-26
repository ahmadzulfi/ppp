# wa-mantap — Panduan Deploy

Panduan ini menjelaskan cara memasang **wa-mantap** di server Linux sampai
siap menerima pesan WhatsApp warga, lalu cara merawatnya sehari-hari. Ditulis
untuk admin server, termasuk yang tidak ikut menulis kodenya. Panduan
menjalankan di laptop untuk pengembangan ada di [DEVELOPMENT.md](DEVELOPMENT.md).

**wa-mantap** adalah platform WhatsApp (Cloud API resmi Meta) dengan
multi-nomor, inbox bersama, flow builder untuk bot, broadcast, Public API,
dan AI (basis pengetahuan dan router "Arahkan AI").

## Daftar isi

1. [Gambaran arsitektur](#1-gambaran-arsitektur)
2. [Kebutuhan server](#2-kebutuhan-server)
3. [Siapkan server](#3-siapkan-server)
4. [Ambil kode dan isi konfigurasi](#4-ambil-kode-dan-isi-konfigurasi)
5. [Siapkan database](#5-siapkan-database)
6. [Build dan nyalakan](#6-build-dan-nyalakan)
7. [Buat akun dashboard](#7-buat-akun-dashboard)
8. [Pasang nginx dan HTTPS](#8-pasang-nginx-dan-https)
9. [Sambungkan ke Meta](#9-sambungkan-ke-meta)
10. [Arahkan AI ke layanan internal](#10-arahkan-ai-ke-layanan-internal)
11. [Jadwalkan cadangan](#11-jadwalkan-cadangan)
12. [Operasional harian](#12-operasional-harian)
13. [Update dan rollback](#13-update-dan-rollback)
14. [Kalau ada masalah](#14-kalau-ada-masalah)

---

## 1. Gambaran arsitektur

```
internet ──443──> nginx (host) ──┬─ /webhooks/, /api/v1/, /health, /ws ──> webhook :3001
                                 └─ selebihnya ───────────────────> web     :3002
                                                                       │
          container (jaringan internal, tidak terbuka ke luar):        │
          worker ── redis              ai-knowledge :8080 ─────────────┘
          postgres (PostgreSQL 18 + pgvector)
          migrate (jalan sekali tiap deploy, lalu berhenti)
```

| Layanan | Tugas |
|---|---|
| **webhook** | Menerima pesan dari Meta, melayani Public API, dan memegang WebSocket dashboard (`/ws`) |
| **worker** | Menjalankan bot (flow), mengirim pesan, broadcast, webhook keluar |
| **web** | Dashboard admin dan petugas |
| **ai-knowledge** | Basis pengetahuan SOP dan router menu "Arahkan AI" (Go + Gemini) |
| **postgres** | Database seluruh aplikasi (PostgreSQL 18 + pgvector) |
| **redis** | Antrean pesan (BullMQ) dan sinyal pembaruan langsung ke dashboard (pub/sub) |
| **migrate** | Menerapkan migrasi database tiap kali deploy, lalu berhenti |

**Semuanya berjalan di satu server.** Database ikut dipasang sebagai
container `postgres`, dan datanya tersimpan di volume Docker `pgdata` di
server itu sendiri. Tidak ada layanan yang bergantung pada database di
server lain.

Hanya nginx yang terbuka ke internet. Web dan webhook hanya mendengarkan di
`127.0.0.1`, sedangkan layanan lain, termasuk Postgres dan Redis, hanya bisa
dijangkau antarcontainer.

### Isi paket deploy

| Berkas | Isi |
|---|---|
| [`Dockerfile`](Dockerfile) | Image Node: web, webhook, worker, migrate |
| [`backend/ai-knowledge/Dockerfile`](backend/ai-knowledge/Dockerfile) | Image layanan Go |
| [`deploy/compose.yml`](deploy/compose.yml) | Semua layanan beserta volume dan health check |
| [`deploy/.env.example`](deploy/.env.example) | Variabel yang harus diisi, disalin ke `deploy/.env` |
| [`deploy/nginx/wa-mantap.conf`](deploy/nginx/wa-mantap.conf) | Reverse proxy di host |
| [`deploy/deploy.sh`](deploy/deploy.sh) | Pasang/perbarui: tarik kode, build, migrasi, restart |
| [`deploy/backup.sh`](deploy/backup.sh) | Cadangan database harian |

## 2. Kebutuhan server

| Kebutuhan | Minimal | Saran |
|---|---|---|
| OS | Ubuntu 22.04/24.04 atau Debian 12 | |
| CPU / RAM | 2 vCPU / 4 GB | 4 vCPU / 8 GB |
| Disk | 40 GB | 60 GB |

Database ikut menempati disk server ini, jadi sisakan ruang untuk riwayat chat,
media, dan cadangan 14 hari.

Selain itu:

- **Subdomain** yang A record-nya mengarah ke IP publik server, misalnya
  `wa.contoh.go.id`.
- **Port 80 dan 443** terbuka dari internet. Meta mengirim webhook ke 443.
  Port lain tidak perlu dibuka.
- **Akses keluar** ke `graph.facebook.com`, `generativelanguage.googleapis.com`
  (Gemini), Docker Hub, registry npm, dan GitHub.
- **Kunci API Gemini** untuk layanan AI.

Build image pertama butuh sekitar 2 GB RAM dan 5–10 menit.

## 3. Siapkan server

Masuk ke server lewat SSH, lalu pasang Docker, nginx, certbot, dan git:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo apt install -y nginx certbot python3-certbot-nginx git
```

Logout lalu login lagi supaya grup `docker` berlaku, kemudian cek:

```bash
docker compose version
```

Kalau server memakai firewall `ufw`, buka hanya SSH, HTTP, dan HTTPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 4. Ambil kode dan isi konfigurasi

```bash
git clone <url-repo> wa-mantap
cd wa-mantap
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
nano deploy/.env
```

Kalau repo-nya private, `git clone` akan meminta username dan *personal
access token* sebagai pengganti kata sandi.

Isi setiap nilai di `deploy/.env` sesuai komentar di dalamnya. Nilai rahasia
dibuat baru dengan `openssl`:

```bash
openssl rand -hex 24      # POSTGRES_PASSWORD (cukup huruf dan angka)
openssl rand -base64 32   # ENCRYPTION_KEY
openssl rand -base64 32   # AUTH_SECRET
openssl rand -hex 32      # AI_KNOWLEDGE_API_KEY
```

| Variabel | Isi |
|---|---|
| `DOMAIN` | Subdomain tanpa `https://`, misalnya `wa.contoh.go.id` |
| `COMPOSE_PROFILES` | Biarkan `db-lokal`, supaya container `postgres` ikut menyala |
| `POSTGRES_PASSWORD` | Password database baru |
| `DATABASE_URL` | `postgresql://wa:POSTGRES_PASSWORD@postgres:5432/wa_platform?connection_limit=5` |
| `AI_DATABASE_URL` | `postgresql://wa:POSTGRES_PASSWORD@postgres:5432/wa_platform?sslmode=disable` |
| `ENCRYPTION_KEY`, `AUTH_SECRET` | Hasil `openssl rand -base64 32` |
| `AI_KNOWLEDGE_API_KEY` | Hasil `openssl rand -hex 32` |
| `GEMINI_API_KEY` | Kunci API Gemini |

Ganti `POSTGRES_PASSWORD` di kedua URL dengan password yang sama persis.
Host `postgres` adalah nama container, jadi jangan diganti dengan `localhost`
atau IP.

`ENCRYPTION_KEY` paling penting: kunci ini mengenkripsi token semua nomor WA
di database. Kalau hilang atau berubah, semua nomor harus didaftarkan ulang.
Simpan salinannya di tempat lain, di luar server.

> **Memindahkan data dari instalasi lama?** Pakai `ENCRYPTION_KEY` dan
> `AI_KNOWLEDGE_API_KEY` dari instalasi lama, bukan yang baru. Langkahnya
> ada di [5.2](#52-pindahkan-data-lama-opsional).

## 5. Siapkan database

### 5.1 Nyalakan Postgres

```bash
docker compose -f deploy/compose.yml up -d postgres
docker compose -f deploy/compose.yml ps postgres     # tunggu sampai healthy
```

Buat fungsi `psqldb` untuk sesi terminal ini, supaya bisa membuka database
tanpa memasang klien Postgres di host:

```bash
psqldb() { docker compose -f deploy/compose.yml exec -T postgres psql -U wa -d wa_platform "$@"; }

psqldb -c "select version()"
```

`POSTGRES_PASSWORD` hanya dibaca saat volume `pgdata` pertama kali dibuat.
Mengganti nilainya belakangan tidak mengubah password database, jadi
tentukan sekali dan jangan diubah.

Untuk instalasi baru dengan database kosong, lanjut ke [langkah 6](#6-build-dan-nyalakan).
Tabel dibuat oleh layanan `migrate` dan `ai-knowledge`.

### 5.2 Pindahkan data lama (opsional)

Lakukan ini hanya kalau ingin membawa nomor, flow, kontak, riwayat chat, dan
basis pengetahuan dari instalasi sebelumnya. Kerjakan **sebelum langkah 6**,
selagi database masih kosong.

1. Ambil cadangan dari database lama dalam format custom (`-Fc`):

   ```bash
   docker run --rm -e PGURL="postgresql://USER:PASS@HOST:5432/DB?sslmode=disable" \
     postgres:18-alpine sh -c 'pg_dump -Fc --no-owner --no-acl "$PGURL"' > lama.dump
   ```

2. Pulihkan ke container:

   ```bash
   docker compose -f deploy/compose.yml exec -T postgres \
     pg_restore -U wa -d wa_platform --no-owner --no-acl < lama.dump
   ```

3. Pastikan `ENCRYPTION_KEY` di `deploy/.env` sama dengan kunci instalasi lama.

4. Hentikan webhook, worker, dan web di tempat lama, termasuk tunnel
   cloudflared kalau ada. Kalau dua worker sama-sama jalan, warga bisa
   menerima balasan bot dua kali dari tempat yang berbeda.

### 5.3 Percepat pencarian basis pengetahuan (hanya untuk data lama)

Database baru langsung memakai tipe `vector` dari pgvector, jadi bagian ini
bisa dilewati. Data yang dipulihkan dari instalasi lama mungkin masih
menyimpan embedding sebagai array angka biasa (`double precision[]`). Layanan
AI tetap jalan dengan data seperti itu, tetapi setiap pencarian membandingkan
pertanyaan dengan semua dokumen satu per satu. Ubah ke tipe `vector` supaya
layanan memakai index HNSW yang jauh lebih cepat.

Cek tipenya dulu:

```bash
psqldb -c "SELECT table_name, column_name, udt_name FROM information_schema.columns
           WHERE column_name IN ('embedding', 'query_embedding')"
```

Kalau `udt_name` berisi `_float8`, jalankan konversi berikut. Kalau sudah
`vector`, lewati.

```bash
psqldb -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "docs-gemini-001" ALTER COLUMN embedding TYPE vector(768) USING embedding::vector(768);
ALTER TABLE query_cache ALTER COLUMN query_embedding TYPE vector(768) USING query_embedding::vector(768);
COMMIT;
SQL
```

Catatan:

- **Kedua tabel harus dikonversi bersamaan.** Layanan AI menentukan mode dari
  tabel `docs-gemini-001`, lalu memakai mode yang sama untuk `query_cache`.
  Perintah di atas berjalan dalam satu transaksi, jadi kalau ada yang gagal,
  keduanya batal.
- **Konversi gagal kalau ada embedding yang ukurannya bukan 768 angka.**
  Database tetap utuh, dan layanan tetap jalan dalam mode array.
- **Index HNSW tidak perlu dibuat manual.** Layanan AI membuatnya sendiri saat
  start di langkah 6. Di log `ai-knowledge` harus muncul
  `Mode Aktif: pgvector Extension (HNSW Indexing)`.
- **Router "Arahkan AI" tidak terpengaruh.** Tabel `route_embeddings` memang
  memakai array, dan kemiripannya dihitung di aplikasi.

## 6. Build dan nyalakan

```bash
chmod +x deploy/*.sh
./deploy/deploy.sh --no-pull
```

Perintah ini membangun image, menjalankan migrasi database, lalu menyalakan
semua layanan. Layanan lain menunggu `postgres` siap dan migrasi selesai.

Setelah selesai, cek statusnya:

```bash
docker compose -f deploy/compose.yml ps
```

Hasil yang benar:

- `migrate` berstatus *Exited (0)*. Itu normal karena tugasnya memang hanya
  sekali jalan.
- `postgres`, `redis`, `webhook`, `web`, dan `ai-knowledge` berstatus *healthy*.
- `worker` berstatus *Up*.

Uji dari server:

```bash
curl http://127.0.0.1:3001/health                                   # {"ok":true,...}
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3002/login   # 200
```

## 7. Buat akun dashboard

Database baru belum punya akun, jadi buat akun pertama:

```bash
docker compose -f deploy/compose.yml run --rm web \
  node --import tsx src/scripts/user-add.ts \
  --email admin@contoh.go.id --name "Admin" --password "minimal-8-karakter"
```

Akun ini berperan OWNER. Tambahkan `--role ADMIN` (atau `SUPERVISOR`,
`AGENT`, `VIEWER`) untuk peran lain. Kalau data lama sudah dipulihkan di
langkah 5.2, akun lama ikut terbawa dan langkah ini hanya perlu untuk
menambah akun baru.

## 8. Pasang nginx dan HTTPS

Ganti `DOMAIN-ANDA` dengan subdomain yang sama dengan `DOMAIN` di
`deploy/.env`:

```bash
sudo cp deploy/nginx/wa-mantap.conf /etc/nginx/sites-available/wa-mantap
sudo sed -i 's/wa.contoh.go.id/DOMAIN-ANDA/' /etc/nginx/sites-available/wa-mantap
sudo ln -s /etc/nginx/sites-available/wa-mantap /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d DOMAIN-ANDA
```

Certbot memasang sertifikat Let's Encrypt, mengalihkan HTTP ke HTTPS, dan
memperpanjangnya otomatis. Kalau `nginx -t` mengeluh `$connection_upgrade`
sudah didefinisikan, hapus blok `map` di bagian bawah berkas konfigurasi.

Buka `https://DOMAIN-ANDA`, lalu login dengan akun dari langkah 7.

## 9. Sambungkan ke Meta

1. Di dashboard, buka halaman **Nomor**. Salin *Callback URL* tiap koneksi WABA
   (bentuknya `https://DOMAIN/webhooks/whatsapp/<id>`) beserta *Verify token*-nya.
   Kalau belum ada koneksi, buat dulu di halaman itu.
2. Di Meta App → WhatsApp → Configuration, isi Callback URL dan Verify token
   tersebut. Kalau sebelumnya memakai URL cloudflared, ganti dengan yang baru.
   Klik *Verify and save*.
3. Pastikan field `messages` tercentang di bagian Webhook fields.
4. Kirim pesan uji ke nomor WA itu. Pesan harus muncul di **Inbox**, dan bot
   membalas kalau ada flow yang aktif.

## 10. Arahkan AI ke layanan internal

Di server ini layanan AI dipanggil lewat nama container, bukan `localhost`.
Di halaman **AI** pada dashboard, isi atau ubah URL setiap endpoint:

| Jenis endpoint | URL |
|---|---|
| Arahkan ke menu (router) | `http://ai-knowledge:8080/route` |
| Jawab pertanyaan (pencarian SOP) | `http://ai-knowledge:8080/documents/search` (sesuaikan path/query yang dipakai) |

Header `X-Internal-API-Key` di endpoint itu harus sama dengan
`AI_KNOWLEDGE_API_KEY` di `deploy/.env`. Pakai tombol uji di halaman yang sama
untuk memastikan jawabannya keluar.

`http://` ke `ai-knowledge:8080` diizinkan karena compose mengisi
`INTERNAL_SERVICE_HOSTS`. Alamat internal lain, seperti database dan Redis,
tetap ditolak.

## 11. Jadwalkan cadangan

```bash
crontab -e
```

Tambahkan baris berikut (sesuaikan path):

```
30 1 * * * /home/USER/wa-mantap/deploy/backup.sh >> /home/USER/wa-mantap-backup.log 2>&1
```

Skrip ini menjalankan `pg_dump` di dalam container `postgres` dan menyimpan
hasilnya di `deploy/backups/` selama 14 hari. Cadangan itu masih berada di
server yang sama, jadi **salin rutin ke luar server**, misalnya dengan
`rsync` atau `scp` ke mesin lain. `ENCRYPTION_KEY` tidak ikut tercadang, jadi
simpan salinannya terpisah.

**Memulihkan:** cara paling aman adalah memulihkan ke database baru yang
kosong dulu untuk diperiksa:

```bash
psqldb -c "CREATE DATABASE wa_mantap_pulih"      # fungsi psqldb: langkah 5.1
docker compose -f deploy/compose.yml exec -T postgres \
  pg_restore -U wa -d wa_mantap_pulih --no-owner --no-acl < deploy/backups/<file>.dump
```

Kalau isinya sudah benar dan ingin menimpa database utama, hentikan aplikasi
dulu, ganti database, lalu nyalakan lagi:

```bash
docker compose -f deploy/compose.yml stop webhook worker web ai-knowledge
psqldb -d postgres -c "DROP DATABASE wa_platform WITH (FORCE)"
psqldb -d postgres -c "CREATE DATABASE wa_platform OWNER wa"
docker compose -f deploy/compose.yml exec -T postgres \
  pg_restore -U wa -d wa_platform --no-owner --no-acl < deploy/backups/<file>.dump
./deploy/deploy.sh --no-pull
```

## 12. Operasional harian

Jalankan dari folder `wa-mantap`:

| Keperluan | Perintah |
|---|---|
| Status layanan | `docker compose -f deploy/compose.yml ps` |
| Log satu layanan | `docker compose -f deploy/compose.yml logs -f --tail=100 worker` |
| Log semua layanan | `docker compose -f deploy/compose.yml logs -f --tail=50` |
| Restart satu layanan | `docker compose -f deploy/compose.yml restart worker` |
| Matikan semua | `docker compose -f deploy/compose.yml down` (data tetap aman di volume `pgdata`) |
| Masuk ke database | `psqldb` (fungsi dari langkah 5.1) |
| Ukuran database | `psqldb -c "select pg_size_pretty(pg_database_size('wa_platform'))"` |
| Pemakaian disk Docker | `docker system df` |

> **Jangan pernah** menjalankan `docker compose ... down -v`. Opsi `-v`
> menghapus volume `pgdata` dan `redisdata`, artinya **seluruh database**
> beserta pesan yang masih mengantre ikut hilang.

Semua layanan otomatis menyala lagi setelah server reboot.

## 13. Update dan rollback

**Update ke kode terbaru:**

```bash
./deploy/deploy.sh
```

Skrip ini menarik kode (`git pull`), membangun ulang image, menjalankan
migrasi, lalu me-restart layanan yang berubah. Selama restart, bot berhenti
beberapa detik. Pesan yang sudah masuk antrean diproses setelahnya, dan Meta
mengirim ulang webhook yang sempat gagal diterima.

Sebelum update besar, ambil cadangan manual dulu: `./deploy/backup.sh`.

**Kembali ke versi sebelumnya:**

```bash
git log --oneline -5                  # pilih commit tujuan
git checkout <commit>
./deploy/deploy.sh --no-pull
```

Migrasi database tidak ikut mundur. Kalau versi yang dibatalkan mengubah
skema, pulihkan cadangan dari sebelum update (langkah 11). Untuk kembali ke
versi terbaru: `git checkout main && ./deploy/deploy.sh`.

## 14. Kalau ada masalah

| Gejala | Periksa |
|---|---|
| `postgres` tidak *healthy* | `logs postgres`. Pastikan `COMPOSE_PROFILES=db-lokal` dan `POSTGRES_PASSWORD` terisi di `deploy/.env`. |
| `migrate` gagal dan layanan lain tidak naik | `logs migrate`. Biasanya password di `DATABASE_URL` tidak sama dengan `POSTGRES_PASSWORD`, atau host-nya bukan `postgres`. |
| Password database ditolak padahal sudah diganti | `POSTGRES_PASSWORD` hanya berlaku saat volume dibuat. Kembalikan ke nilai lama, atau ubah lewat `psqldb -c "ALTER USER wa PASSWORD '...'"`. |
| `ai-knowledge` terus restart | `logs ai-knowledge`. Biasanya `GEMINI_API_KEY` kosong atau `AI_DATABASE_URL` salah. |
| Pesan warga tidak masuk | Callback URL di Meta, `logs webhook`, dan `curl https://DOMAIN/health`. |
| Pesan masuk tapi bot diam | `logs worker`. Apakah flow sudah terbit dan aktif? |
| Arahkan AI selalu jatuh ke menu | URL di halaman AI (langkah 10), `logs ai-knowledge`, dan `GEMINI_API_KEY`. |
| Inbox baru berubah setelah beberapa detik, bukan seketika | WebSocket tidak tersambung, jadi dashboard kembali ke polling. Pastikan blok `location = /ws` ada di konfigurasi nginx (berkas yang disalin sebelum fitur ini ada belum memuatnya), lalu `sudo nginx -t && sudo systemctl reload nginx`. |
| Login berputar kembali ke halaman login | `DOMAIN` di `deploy/.env` harus sama persis dengan alamat yang dibuka di browser. |
| Token nomor WA "tidak bisa didekripsi" | `ENCRYPTION_KEY` berbeda dari yang dipakai saat nomor didaftarkan. |
| Build gagal karena kehabisan memori | Tambahkan swap 2 GB, atau build di mesin lain. |
| Disk penuh | `docker system df`, lalu `docker image prune -a` untuk image lama, dan hapus cadangan lama di `deploy/backups/` yang sudah disalin ke luar. |
