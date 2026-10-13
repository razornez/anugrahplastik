"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AdminInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type AdminInstallContextValue = {
  installed: boolean;
  prompt: AdminInstallPromptEvent | null;
  clearPrompt: () => void;
};

const AdminInstallContext = createContext<AdminInstallContextValue | null>(null);

export function AdminInstallProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<AdminInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))),
  );

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as AdminInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/api/admin/app-manifest";
    manifest.crossOrigin = "use-credentials";
    manifest.dataset.adminManifest = "true";
    document.head.append(manifest);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      manifest.remove();
    };
  }, []);

  const value = useMemo(() => ({ installed, prompt, clearPrompt: () => setPrompt(null) }), [installed, prompt]);

  return <AdminInstallContext.Provider value={value}>{children}</AdminInstallContext.Provider>;
}

export function useAdminInstall() {
  const value = useContext(AdminInstallContext);
  if (!value) throw new Error("useAdminInstall must be used inside AdminInstallProvider");
  return value;
}
