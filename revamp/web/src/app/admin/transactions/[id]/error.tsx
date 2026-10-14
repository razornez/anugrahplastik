"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function TransactionError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const detailPath = /^\/admin\/transactions\/[0-9a-f-]{36}$/i.test(pathname) ? pathname : "/admin/transactions";
  const detailHref = `${detailPath}${search.toString() ? `?${search.toString()}` : ""}`;
  return (
    <section className="transaction-flow-error" role="alert">
      <span aria-hidden="true">!</span>
      <h1>Perubahan belum berhasil disimpan</h1>
      <p>
        Periksa kembali data yang diisi. Jika Anda sedang membuat dokumen atau mengirim email, periksa daftar dokumen
        dan Email terkirim sebelum mencoba lagi agar tidak terjadi duplikasi.
      </p>
      <div>
        <button onClick={() => reset()} type="button">
          Muat ulang halaman
        </button>
        <Link
          href={`${detailHref}#transaction-step-title`}
          onClick={(event) => {
            const anchor = window.location.hash;
            if (/^#[a-zA-Z0-9_-]+$/.test(anchor)) {
              event.preventDefault();
              reset();
              router.push(`${detailHref}${anchor}`);
            } else reset();
          }}
        >
          Kembali ke detail transaksi
        </Link>
      </div>
    </section>
  );
}
