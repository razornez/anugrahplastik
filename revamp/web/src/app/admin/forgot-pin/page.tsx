import Link from "next/link";
import { requestAccessHelp } from "@/features/auth/actions";

export const instant = false;

export default async function ForgotPinPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  return (
    <section className="admin-auth-page" aria-labelledby="help-title">
      <main className="admin-auth-panel">
        <Link className="admin-auth-back" href="/admin/login">
          ← Kembali
        </Link>
        <div className="admin-auth-heading">
          <p className="eyebrow">BANTUAN MASUK</p>
          <h1 id="help-title">Pulihkan akses</h1>
          <p>Masukkan email akun. Kami akan mengirim username dan tautan membuat PIN baru jika data cocok.</p>
        </div>
        {sent ? (
          <p className="login-message login-message--success" role="status">
            Jika email terdaftar, petunjuk pemulihan sudah dikirim.
          </p>
        ) : (
          <form action={requestAccessHelp} className="login-form">
            <label htmlFor="help-email">Email akun</label>
            <input autoComplete="email" id="help-email" name="email" required type="email" />
            <button className="login-submit" type="submit">
              Kirim petunjuk
            </button>
          </form>
        )}
      </main>
    </section>
  );
}
