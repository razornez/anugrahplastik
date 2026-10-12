import { login } from "@/features/content/admin-actions";
import { getSession } from "@/lib/auth/session";
import Image from "next/image";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin-login-form";

export const instant = false;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getSession();
  if (session) redirect("/admin");
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
      <aside className="login-context" aria-hidden="true">
        <Image
          src="/images-webp/mesin/Anugrah Plastik (71).webp"
          alt=""
          fill
          priority
          sizes="(max-width: 760px) 100vw, 50vw"
        />
        <div className="login-context__copy">
          <Image alt="" className="login-context__mark" height={42} src="/brand/anugrah-plastik-mark.png" width={42} />
          <p className="eyebrow">Area kerja internal</p>
          <p className="login-context__message">Kelola prospek, konten, dan operasional dalam satu tempat.</p>
        </div>
      </aside>
      <main className="login-panel" aria-labelledby="login-title">
        <header className="login-panel__header">
          <Image
            alt="Anugrah Plastik"
            className="login-mark"
            height={46}
            priority
            src="/brand/anugrah-plastik-mark.png"
            width={46}
          />
          <div>
            <p className="eyebrow">ANUGRAH PLASTIK</p>
            <p className="login-panel__brand">Ruang kerja internal</p>
          </div>
        </header>
        <h1 id="login-title">Masuk ke ruang kerja</h1>
        <p className="login-panel__intro">Gunakan akun yang telah diberikan untuk melanjutkan pekerjaan.</p>
        <AdminLoginForm
          action={login}
          email={localAutofill?.email}
          password={localAutofill?.password}
          message={message}
        />
      </main>
    </section>
  );
}
