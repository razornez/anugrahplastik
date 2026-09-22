import { login } from "@/features/content/admin-actions";

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
    <section className="admin-card login-card">
      <p>BACK OFFICE</p>
      <h1>Masuk untuk mengelola konten</h1>
      <form action={login}>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" defaultValue={localAutofill?.email} required />
        </label>
        <label>
          Kata sandi
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            defaultValue={localAutofill?.password}
            required
          />
        </label>
        {message ? <small>{message}</small> : null}
        <button type="submit">Masuk</button>
      </form>
    </section>
  );
}
