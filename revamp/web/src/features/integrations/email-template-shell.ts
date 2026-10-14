export const emailShellPresets = ["corporate-navy"] as const;
export const emailShellAccents = ["blue", "sky", "gold"] as const;

export type EmailShellConfig = {
  preset: (typeof emailShellPresets)[number];
  accent: (typeof emailShellAccents)[number];
  logoPath: "/brand/quotation-logo.png";
  companyName: string;
  tagline: string;
  contactEmail: string;
  footerText: string;
};

export type BrandShellConfig = EmailShellConfig;

export const defaultEmailShellConfig: EmailShellConfig = {
  preset: "corporate-navy",
  accent: "blue",
  logoPath: "/brand/quotation-logo.png",
  companyName: "ANUGRAH PLASTIK",
  tagline: "CETAK PLASTIK · BANDUNG",
  contactEmail: "cs@anugrahplastik.com",
  footerText: "Pesan ini dikirim dari layanan pelanggan Anugrah Plastik.",
};

function validShellText(value: unknown, fallback: string, limit: number) {
  if (typeof value !== "string") return fallback;
  const result = value.trim().replace(/\s+/g, " ");
  return result && result.length <= limit ? result : fallback;
}

/** Old versions without this field deliberately use the corporate default. */
export function parseEmailShellConfig(raw: unknown): EmailShellConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...defaultEmailShellConfig };
  const input = raw as Record<string, unknown>;
  const email = typeof input.contactEmail === "string" ? input.contactEmail.trim().toLowerCase() : "";
  return {
    preset: emailShellPresets.includes(input.preset as EmailShellConfig["preset"])
      ? (input.preset as EmailShellConfig["preset"])
      : defaultEmailShellConfig.preset,
    accent: emailShellAccents.includes(input.accent as EmailShellConfig["accent"])
      ? (input.accent as EmailShellConfig["accent"])
      : defaultEmailShellConfig.accent,
    logoPath: "/brand/quotation-logo.png",
    companyName: validShellText(input.companyName, defaultEmailShellConfig.companyName, 80),
    tagline: validShellText(input.tagline, defaultEmailShellConfig.tagline, 100),
    contactEmail:
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : defaultEmailShellConfig.contactEmail,
    footerText: validShellText(input.footerText, defaultEmailShellConfig.footerText, 240),
  };
}

export function validateEmailShellConfig(raw: unknown): EmailShellConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Tampilan email belum lengkap.");
  const input = raw as Record<string, unknown>;
  if (input.preset !== "corporate-navy") throw new Error("Preset tampilan email tidak tersedia.");
  if (!emailShellAccents.includes(input.accent as EmailShellConfig["accent"]))
    throw new Error("Warna aksen email tidak tersedia.");
  if (input.logoPath && input.logoPath !== "/brand/quotation-logo.png")
    throw new Error("Logo tampilan bersama tidak tersedia.");
  const config = parseEmailShellConfig(input);
  if (
    config.companyName !==
      String(input.companyName ?? "")
        .trim()
        .replace(/\s+/g, " ") ||
    config.tagline !==
      String(input.tagline ?? "")
        .trim()
        .replace(/\s+/g, " ") ||
    config.contactEmail !==
      String(input.contactEmail ?? "")
        .trim()
        .toLowerCase() ||
    config.footerText !==
      String(input.footerText ?? "")
        .trim()
        .replace(/\s+/g, " ")
  )
    throw new Error("Lengkapi nama, tagline, email kontak, dan footer dengan nilai yang valid.");
  return config;
}
