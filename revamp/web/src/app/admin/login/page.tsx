import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin-login-form";
import { login } from "@/features/auth/actions";
import { getSession } from "@/lib/auth/session";

export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/admin");
  const { error, status } = await searchParams;
  const username = (await cookies()).get("ap_admin_username")?.value ?? "";
  const message =
    error === "database"
      ? "Layanan masuk sedang tidak tersedia. Coba lagi sebentar."
      : error === "credentials"
        ? "Username atau PIN tidak sesuai."
        : error === "rate-limit"
          ? "Terlalu banyak percobaan. Akses sementara dikunci."
          : null;

  return (
    <section className="admin-auth-page" aria-labelledby="login-title">
      <main className="admin-auth-panel">
        <header className="admin-auth-brand">
          <Image alt="" height={42} priority src="/brand/anugrah-plastik-mark.png" width={42} />
          <div>
            <p className="eyebrow">ANUGRAH PLASTIK</p>
            <p>Back Office</p>
          </div>
        </header>
        <div className="admin-auth-heading">
          <h1 id="login-title">Masuk</h1>
          <p>Gunakan username dan PIN enam digit Anda.</p>
        </div>
        <AdminLoginForm action={login} message={message} status={status} username={username} />
      </main>
    </section>
  );
}
