export type TransactionOption = {
  id: string;
  referenceNo: string;
  title: string;
  customerName: string;
  ownerName: string | null;
  updatedAt: string;
  dataClass: string;
  photoId: string | null;
};

export function transactionSearchPattern(query: string) {
  return `%${query
    .trim()
    .slice(0, 120)
    .replace(/[\\%_]/g, "\\$&")}%`;
}

export function transactionPickerDataClass() {
  return "production";
}
