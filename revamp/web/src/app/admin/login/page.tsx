import { login } from "@/features/content/admin-actions";
import Image from "next/image";
import { AdminLoginForm } from "@/components/admin-login-form";

export const instant = false;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const localAutofill =
    process.env.NODE_ENV === "development" && process.env.LOCAL_ADMIN_AUTOFILL === "true"
      ? {
          email: process.env.INITIAL_ADMIN_EMAIL ?? "",
          password: process.env.INITIAL_ADMIN_PASSWORD ?? "",
        }
      : null;
  const message =
    error === "database"
      ? "Database belum terhubung."
      : error === "credentials"
        ? "Email atau kata sandi tidak sesuai."
        : error === "rate-limit"
          ? "Terlalu banyak percobaan. Silakan tunggu beberapa saat."
          : null;

  return (
    <section className="login-experience">
      <div className="login-context">
        <Image
          src="/images-webp/mesin/Anugrah Plastik (71).webp"
          alt="Proses produksi Anugrah Plastik"
          fill
          priority
          sizes="(max-width: 760px) 100vw, 50vw"
        />
        <div>
          <span>ANUGRAH PLASTIK</span>
          <h1>Ruang kerja untuk setiap permintaan yang berarti.</h1>
          <p>Kelola prospek, konten, dan pembelajaran pemasaran dalam satu tempat.</p>
        </div>
      </div>
      <div className="login-panel">
        <div className="login-mark">AP</div>
        <p className="eyebrow">Back office</p>
        <h2>Selamat datang kembali.</h2>
        <span>Masuk untuk melanjutkan pekerjaan hari ini.</span>
        <AdminLoginForm
          action={login}
          email={localAutofill?.email}
          password={localAutofill?.password}
          message={message}
        />
      </div>
    </section>
  );
}
