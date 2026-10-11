const sourceNames: Record<string, string> = {
  serpapi_business_discovery: "Calon pelanggan · riset perusahaan",
  "home-demo-v1": "Form website",
  "google / cpc": "Iklan Google",
  "google / organic": "Pencarian Google",
  instagram: "Instagram",
  referal: "Rujukan",
  whatsapp: "WhatsApp",
  website: "Website",
};

export function prospectSourceLabel(source: string) {
  return sourceNames[source.trim().toLowerCase()] ?? source;
}
