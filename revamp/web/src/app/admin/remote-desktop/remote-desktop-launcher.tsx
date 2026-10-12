"use client";

import { useActionState, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { authorizeRemoteDesktopLaunch, type RemoteDesktopLaunchState } from "@/features/remote-desktop/actions";
import styles from "./remote-desktop.module.css";

const initialState: RemoteDesktopLaunchState = { error: null, downloadUrl: null };

export function RemoteDesktopLauncher({ configured }: { configured: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(authorizeRemoteDesktopLaunch, initialState);

  useEffect(() => {
    if (!state.downloadUrl) return;
    window.location.assign(state.downloadUrl);
  }, [state.downloadUrl]);

  if (!configured) {
    return (
      <button className={styles.primaryAction} type="button" disabled aria-describedby="remote-desktop-setup-note">
        Menunggu pengaturan Tailscale
      </button>
    );
  }

  return (
    <Dialog.Root open={state.downloadUrl ? false : open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className={styles.primaryAction} type="button">
          <DesktopIcon />
          Buka Remote Desktop
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.backdrop} />
        <Dialog.Content className={styles.dialog} aria-describedby="remote-desktop-confirmation">
          <div className={styles.dialogHead}>
            <div className={styles.iconFrame} aria-hidden="true">
              <DesktopIcon />
            </div>
            <div>
              <Dialog.Title>Verifikasi sebelum membuka komputer rumah</Dialog.Title>
              <Dialog.Description id="remote-desktop-confirmation">
                Masukkan kata sandi akun admin Anda. File koneksi berlaku satu kali selama dua menit.
              </Dialog.Description>
            </div>
            <Dialog.Close className={styles.close} aria-label="Tutup verifikasi Remote Desktop" type="button">
              ×
            </Dialog.Close>
          </div>
          <form action={action} className={styles.launchForm}>
            <label>
              Kata sandi admin
              <input name="password" type="password" autoComplete="current-password" required autoFocus />
            </label>
            {state.error ? (
              <p className={styles.formError} role="alert">
                {state.error}
              </p>
            ) : null}
            <div className={styles.dialogActions}>
              <Dialog.Close type="button">Batal</Dialog.Close>
              <button type="submit" disabled={pending}>
                {pending ? "Memverifikasi…" : "Unduh koneksi RDP"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
