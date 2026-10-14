export const documentTemplateKinds = ["quotation", "invoice", "delivery", "handover"] as const;

export type DocumentTemplateKind = (typeof documentTemplateKinds)[number];

export const documentTemplateLabels: Record<DocumentTemplateKind, string> = {
  quotation: "Penawaran",
  invoice: "Invoice",
  delivery: "Surat Jalan",
  handover: "STB",
};
