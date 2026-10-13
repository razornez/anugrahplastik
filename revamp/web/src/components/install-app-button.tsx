"use client";

import { useAdminInstall } from "@/components/admin-install-provider";

export function InstallAppButton() {
  const { installed, prompt, clearPrompt } = useAdminInstall();

  if (installed) return <p className="install-status">Aplikasi sudah terpasang di perangkat ini.</p>;

  async function install() {
    if (!prompt) {
      window.alert("Gunakan menu browser, lalu pilih Tambahkan ke Layar Utama untuk memasang aplikasi.");
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") clearPrompt();
  }

  return (
    <button className="install-app-button" type="button" onClick={install}>
      Pasang aplikasi di perangkat ini
    </button>
  );
}
