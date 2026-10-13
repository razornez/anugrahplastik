import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminPageHeader } from "@/components/admin-page-header";
import { RemoteDesktopLauncher } from "./remote-desktop-launcher";
import { getSession } from "@/lib/auth/session";
import { getRemoteDesktopConfiguration } from "@/features/remote-desktop/service";
import styles from "./remote-desktop.module.css";

export const instant = false;

export default async function RemoteDesktopPage() {
  const user = await getSession();
  if (!user || user.role !== "admin") redirect("/admin");
  const configuration = getRemoteDesktopConfiguration();
  const configured = configuration.status === "configured";

  return (
    <section className={styles.workspace} aria-labelledby="remote-desktop-title">
      <AdminPageHeader
        title="Remote Desktop"
        titleId="remote-desktop-title"
        description="Akses komputer rumah dari laptop melalui jaringan privat Tailscale. Tidak ada port desktop yang dibuka ke internet."
      />

      <section className={styles.hero} aria-labelledby="remote-desktop-device">
        <div className={styles.deviceIdentity}>
          <span className={styles.deviceIcon} aria-hidden="true">
            <DesktopIcon />
          </span>
          <div>
            <p className={styles.eyebrow}>PERANGKAT PRIBADI</p>
            <h2 id="remote-desktop-device">Komputer Rumah</h2>
            <p>RDP asli Windows dibuka pada laptop Anda. Printer dan clipboard laptop dapat digunakan di sesi ini.</p>
          </div>
        </div>
        <div className={styles.statusArea}>
          <span className={`${styles.status} ${configured ? styles.statusReady : styles.statusPending}`}>
            <span aria-hidden="true" />
            {configured ? "Konfigurasi siap" : "Belum disiapkan"}
          </span>
          <RemoteDesktopLauncher configured={configured} />
        </div>
      </section>

      {configured ? (
        <section className={styles.notice} aria-live="polite">
          <strong>Siap dari sisi aplikasi.</strong>
          <p>
            File RDP hanya dapat diunduh setelah verifikasi kata sandi dan berlaku satu kali. Koneksi aktual membutuhkan
            laptop dan komputer rumah yang sama-sama tersambung ke Tailscale.
          </p>
        </section>
      ) : (
        <section className={styles.notice} id="remote-desktop-setup-note">
          <strong>Pengaturan fisik masih diperlukan.</strong>
          <p>
            Pasang Tailscale di laptop dan komputer rumah, aktifkan Remote Desktop Windows, lalu isi hostname Tailscale
            komputer rumah pada environment server. Tidak ada koneksi yang dapat dibuka sebelum itu.
          </p>
        </section>
      )}

      <section className={styles.grid} aria-label="Cara kerja dan perlindungan Remote Desktop">
        <article>
          <span className={styles.step}>1</span>
          <h2>Jaringan privat</h2>
          <p>
            Tailscale menghubungkan laptop dan komputer rumah secara terenkripsi tanpa port forwarding atau IP publik.
          </p>
        </article>
        <article>
          <span className={styles.step}>2</span>
          <h2>Verifikasi ulang</h2>
          <p>Setiap unduhan koneksi meminta kata sandi admin kembali dan dicatat pada riwayat audit.</p>
        </article>
        <article>
          <span className={styles.step}>3</span>
          <h2>RDP di laptop</h2>
          <p>
            Windows meminta kredensial komputer rumah langsung di klien RDP; aplikasi tidak menyimpan password tersebut.
          </p>
        </article>
      </section>

      <section className={styles.tutorial} aria-labelledby="remote-tutorial-title">
        <div className={styles.tutorialHeading}>
          <p className={styles.eyebrow}>PANDUAN PERTAMA KALI</p>
          <h2 id="remote-tutorial-title">Akses dari mana saja</h2>
          <p>Ikuti urutan ini. Tidak perlu mengubah router, membuka port, atau menyentuh VPS.</p>
        </div>

        <aside className={styles.requirement} aria-label="Syarat komputer rumah">
          <strong>Komputer rumah harus memakai Windows Pro, Enterprise, Education, atau Server.</strong>
          <span>Windows Home tidak dapat menjadi host RDP. Jangan membuka router atau memasang RDP wrapper.</span>
        </aside>

        <div className={styles.setupColumns}>
          <article className={styles.setupCard} aria-labelledby="home-setup-title">
            <div className={styles.setupCardHead}>
              <span className={styles.step}>A</span>
              <div>
                <p className={styles.eyebrow}>KERJAKAN DI RUMAH</p>
                <h3 id="home-setup-title">Komputer Rumah</h3>
              </div>
            </div>
            <ol className={styles.stepList}>
              <SetupStep number="1" icon="network" title="Masuk ke Tailscale">
                Instal, lalu masuk memakai akun Google/Microsoft yang akan dipakai juga di laptop.{" "}
                <ExternalLink href="https://tailscale.com/download/windows">Unduh Tailscale</ExternalLink>
              </SetupStep>
              <SetupStep number="2" icon="power" title="Buat komputer selalu siap">
                Tailscale → <em>Preferences</em> → <em>Run Unattended</em>. Di Power Windows, pilih jangan tidur saat
                tersambung listrik.
              </SetupStep>
              <SetupStep number="3" icon="desktop" title="Nyalakan Remote Desktop">
                Settings → System → Remote Desktop → On. Biarkan <em>Network Level Authentication</em> tetap aktif.
              </SetupStep>
              <SetupStep number="4" icon="lock" title="Gunakan password Windows">
                RDP memakai password akun Windows, bukan PIN. Jangan membagikan password tersebut.
              </SetupStep>
              <SetupStep number="5" icon="send" title="Kirim nama komputer">
                Salin nama dari Tailscale, misalnya <code>komputer-rumah.tailnet.ts.net</code>, lalu kirim ke admin
                aplikasi agar tombol koneksi dapat diaktifkan.
              </SetupStep>
            </ol>
          </article>

          <article className={styles.setupCard} aria-labelledby="laptop-setup-title">
            <div className={styles.setupCardHead}>
              <span className={styles.step}>B</span>
              <div>
                <p className={styles.eyebrow}>KERJAKAN DI LAPTOP</p>
                <h3 id="laptop-setup-title">Laptop akses</h3>
              </div>
            </div>
            <ol className={styles.stepList}>
              <SetupStep number="1" icon="network" title="Masuk ke Tailscale">
                Instal di laptop dan masuk memakai akun yang sama.{" "}
                <ExternalLink href="https://tailscale.com/download">Unduh Tailscale</ExternalLink>
              </SetupStep>
              <SetupStep number="2" icon="check" title="Cek Komputer Rumah online">
                Buka Tailscale. Jika Komputer Rumah belum online, nyalakan komputer dan periksa internetnya.
              </SetupStep>
              <SetupStep number="3" icon="download" title="Unduh koneksi dari sini">
                Saat status sudah “Konfigurasi siap”, klik <em>Buka Remote Desktop</em> dan masukkan ulang password
                admin.
              </SetupStep>
              <SetupStep number="4" icon="desktop" title="Masuk ke komputer rumah">
                Buka file RDP lalu pakai nama pengguna dan password Windows komputer rumah. Printer dan clipboard
                tersedia.
              </SetupStep>
              <SetupStep number="5" icon="lock" title="Selesai dengan aman">
                Pilih <em>Disconnect</em> saat selesai. Jangan simpan kredensial Windows pada laptop bersama.
              </SetupStep>
            </ol>
          </article>
        </div>

        <section className={styles.finalCheck} aria-labelledby="remote-final-check-title">
          <div>
            <p className={styles.eyebrow}>UJI CEPAT</p>
            <h3 id="remote-final-check-title">Sebelum mulai bekerja</h3>
          </div>
          <ul className={styles.checkTiles}>
            <li>
              <StepGlyph icon="check" />
              Rumah online
            </li>
            <li>
              <StepGlyph icon="check" />
              Laptop tersambung
            </li>
            <li>
              <StepGlyph icon="check" />
              Status: Konfigurasi siap
            </li>
          </ul>
        </section>
      </section>
    </section>
  );
}

function DesktopIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
      <path d="M8.5 20h7M12 16.5V20" />
    </svg>
  );
}

function SetupStep({
  number,
  icon,
  title,
  children,
}: {
  number: string;
  icon: StepIconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className={styles.setupStep}>
      <span className={styles.stepNumber} aria-hidden="true">
        {number}
      </span>
      <span className={styles.stepGlyph} aria-hidden="true">
        <StepGlyph icon={icon} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </li>
  );
}

type StepIconName = "network" | "power" | "desktop" | "lock" | "send" | "check" | "download";

function StepGlyph({ icon }: { icon: StepIconName }) {
  const paths: Record<StepIconName, ReactNode> = {
    network: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M5 7.5a9.2 9.2 0 0 1 14 0M3.5 5.5a12.4 12.4 0 0 1 17 0M5 16.5a9.2 9.2 0 0 0 14 0" />
      </>
    ),
    power: (
      <>
        <path d="M12 3v8M7 5.8a7 7 0 1 0 10 0" />
      </>
    ),
    desktop: (
      <>
        <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
        <path d="M8.5 20h7M12 16.5V20" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    send: (
      <>
        <path d="m21 3-7.4 18-3.4-7-7.2-3.4L21 3Z" />
        <path d="m10.2 13.9 4.7-4.8" />
      </>
    ),
    check: <path d="m5 12.5 4.4 4.4L19.5 6.8" />,
    download: (
      <>
        <path d="M12 3v11M8 10.5l4 4 4-4M4 20h16" />
      </>
    ),
  };

  return <svg viewBox="0 0 24 24">{paths[icon]}</svg>;
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}
