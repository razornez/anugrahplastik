import Link from "next/link";
import { PinInput } from "@/components/pin-input";
import { setPinFromToken } from "@/features/auth/actions";

export const instant = false;

export default async function ResetPinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; purpose?: string; error?: string }>;
}) {
  const query = await searchParams;
  const validLink = Boolean(query.token && (query.purpose === "activate" || query.purpose === "reset"));
  return (
    <section className="admin-auth-page" aria-labelledby="reset-title">
      <main className="admin-auth-panel">
        <Link className="admin-auth-back" href="/admin/login">
          ← Kembali
        </Link>
        <div className="admin-auth-heading">
          <p className="eyebrow">KEAMANAN AKUN</p>
          <h1 id="reset-title">{query.purpose === "activate" ? "Buat PIN" : "Buat PIN baru"}</h1>
          <p>Gunakan enam digit yang mudah Anda ingat dan tidak mudah ditebak.</p>
        </div>
        {!validLink || query.error === "expired" ? (
          <p className="login-message" role="alert">
            Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru melalui Bantuan masuk.
          </p>
        ) : (
          <form action={setPinFromToken} className="login-form">
            <input name="token" type="hidden" value={query.token} />
            <input name="purpose" type="hidden" value={query.purpose} />
            <label htmlFor="new-pin">PIN baru</label>
            <PinInput id="new-pin" warnWeak />
            <label htmlFor="confirm-pin">Ulangi PIN</label>
            <PinInput id="confirm-pin" name="pinConfirmation" />
            {query.error === "pin" ? (
              <p className="login-message" role="alert">
                Pastikan kedua PIN berisi enam digit yang sama.
              </p>
            ) : null}
            <button className="login-submit" type="submit">
              Simpan PIN
            </button>
          </form>
        )}
      </main>
    </section>
  );
}
