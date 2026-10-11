"use client";

import { useActionState } from "react";
import { saveCsMailbox } from "@/features/integrations/actions";

export function MailboxSetupForm({ encryptionReady, connected }: { encryptionReady: boolean; connected: boolean }) {
  const [message, action, pending] = useActionState(saveCsMailbox, null);
  const form = (
    <form action={action} className="integration-form">
      <input type="hidden" name="email" value="cs@anugrahplastik.com" />
      <label htmlFor="cs-mail-password">Kata sandi mailbox</label>
      <input
        autoComplete="new-password"
        id="cs-mail-password"
        name="password"
        required
        type="password"
        disabled={!encryptionReady || pending}
        placeholder={connected ? "Masukkan hanya untuk memperbarui" : "Masukkan kata sandi email CS"}
      />
      <p className="integration-note">
        Kata sandi diuji ke IMAP dan SMTP sebelum dienkripsi. Setelah tersimpan, nilainya tidak dapat dilihat kembali.
      </p>
      {!encryptionReady ? (
        <p className="integration-alert">
          Server belum memiliki kunci enkripsi. Form ini dinonaktifkan sampai administrator server menyiapkannya.
        </p>
      ) : null}
      {message ? (
        <p className="integration-alert" role="alert">
          {message}
        </p>
      ) : null}
      <button className="admin-primary-button" type="submit" disabled={!encryptionReady || pending}>
        {pending ? "Menguji koneksi…" : connected ? "Uji & perbarui koneksi" : "Uji & sambungkan Email CS"}
      </button>
    </form>
  );

  if (!connected) return form;

  return (
    <details className="integration-credential-update">
      <summary>Perbarui kata sandi mailbox</summary>
      <p>
        Gunakan hanya jika kata sandi mailbox berubah atau pemeriksaan ulang tetap gagal. Kredensial lama tetap
        tersimpan sampai pengujian baru berhasil.
      </p>
      {form}
    </details>
  );
}
