export const prospectStatuses = ["new", "contacted", "qualified", "quoted", "won", "not_qualified"] as const;

export type ProspectStatus = (typeof prospectStatuses)[number];

const labels: Record<ProspectStatus, string> = {
  new: "Baru",
  contacted: "Sudah dihubungi",
  qualified: "Prospek layak",
  quoted: "Penawaran dikirim",
  won: "Menang",
  not_qualified: "Tidak layak",
};

export function isProspectStatus(value: string): value is ProspectStatus {
  return prospectStatuses.includes(value as ProspectStatus);
}

export function prospectStatusLabel(value: string) {
  return isProspectStatus(value) ? labels[value] : "Perlu diperiksa";
}
