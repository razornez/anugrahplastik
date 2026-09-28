# Website lama: rilis manual melalui cPanel

Branch `main` adalah sumber website statis anugrahplastik.com. Branch
`codex/revamp` menyimpan aplikasi baru. Jangan menarik `main` ke repository
cPanel lama di `public_html/anugrahplastikcom`; lokasi itu bukan document root
domain utama dan memiliki perubahan unggahan manual.

Repository cPanel untuk rilis harus dikloning di
`/home/u9433102/anugrahplastik-site-git`, di luar document root. Document root
domain utama adalah `/home/u9433102/public_html` dan juga berisi folder domain
lain. Skrip ini hanya menyalin `index.html`, `css/`, `fonts/`, `img/`, dan `js/`;
tidak pernah menyinkronkan atau menghapus seluruh document root.

1. Pastikan branch checkout cPanel adalah `main` dan working tree bersih.
2. Di Git Version Control cPanel, klik **Update from Remote** pada repository
   baru. Periksa HEAD commit yang diterima.
3. Klik **Deploy HEAD Commit**. Skrip menolak path salah, file tak terduga,
   symlink, atau homepage yang tidak dikenali sebelum menyalin apa pun.
4. Periksa homepage, foto produk, navigasi, dan situs lain yang berbagi root.

Setiap rilis menyimpan file lama yang berubah di
`/home/u9433102/.anugrah-site-backups/<commit>.<acak>/` dan mencatat file baru
pada `manifest.tsv`. Jika perlu rollback, pulihkan **hanya** file `replaced`
dari backup rilis itu dan hapus **hanya** file `created` yang tercatat dan
terverifikasi milik rilis tersebut. Jangan gunakan `git reset --hard`, `rm -rf`
terhadap `public_html`, atau sinkronisasi dengan opsi hapus.

Autodeploy tidak aktif. Setiap rilis perlu dua klik cPanel di atas.
