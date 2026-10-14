export type CustomerDocumentProfileInput = {
  legalName: string;
  email: string;
  phone: string;
  taxId: string;
  billingAddress: string;
  deliveryAddress: string;
};

export type CustomerDocumentProfileState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<keyof CustomerDocumentProfileInput, string>>;
  updatedProfile?: CustomerDocumentProfileInput;
};
