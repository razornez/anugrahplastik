"use client";

import { useEffect } from "react";
import { AdminActionButton, AdminEmptyState } from "@/components/admin-ui";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AdminEmptyState
      title="Halaman belum dapat dimuat"
      description="Data Anda tetap aman. Coba muat ulang bagian ini tanpa meninggalkan Back Office."
      action={<AdminActionButton onClick={reset}>Coba lagi</AdminActionButton>}
    />
  );
}
