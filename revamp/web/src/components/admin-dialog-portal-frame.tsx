"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

type AdminTheme = "light" | "dark" | "system";
type PortalStyle = CSSProperties & {
  "--font-admin-ui"?: string;
  "--font-admin-display"?: string;
};

function readAdminAppearance() {
  const shell = document.querySelector<HTMLElement>(".admin-shell:not(.admin-shell--portal)");
  const value = shell?.dataset.theme;
  const theme: AdminTheme = value === "dark" || value === "system" ? value : "light";
  const computed = shell ? getComputedStyle(shell) : null;
  const style: PortalStyle = {};
  const uiFont = computed?.getPropertyValue("--font-admin-ui").trim();
  const displayFont = computed?.getPropertyValue("--font-admin-display").trim();
  if (uiFont) style["--font-admin-ui"] = uiFont;
  if (displayFont) style["--font-admin-display"] = displayFont;
  return { theme, style };
}

export function AdminDialogPortalFrame({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<{ theme: AdminTheme; style: PortalStyle }>({
    theme: "light",
    style: {},
  });

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".admin-shell:not(.admin-shell--portal)");
    const update = () => setAppearance(readAdminAppearance());
    update();
    if (!shell) return;
    const observer = new MutationObserver(update);
    observer.observe(shell, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="admin-shell admin-shell--public admin-shell--portal"
      data-theme={appearance.theme}
      style={appearance.style}
    >
      {children}
    </div>
  );
}
