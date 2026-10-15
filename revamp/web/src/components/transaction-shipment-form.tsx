"use client";

import { useActionState, useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminToast } from "@/components/admin-ui";
import { saveShipmentInline, type ShipmentActionState } from "@/features/operations/workflow-actions";
import { formatCustomerAddress, type TransactionCustomerSnapshot } from "@/features/operations/customer-profile";
import { useTransactionDraft } from "@/components/use-transaction-draft";
import {
  emptyDeliveryDetails,
  emptyLogistics,
  shipmentPackError,
  type DeliveryDetails,
  type ShipmentLogistics,
} from "@/features/operations/delivery-note";

type Line = { id: string; description: string; unit: string; remaining: number };
type InitialItem = { lineId: string; quantity: string; logistics: ShipmentLogistics };
const initialAction: ShipmentActionState = { ok: false, message: "", fieldErrors: {} };

function jakartaInputDate(value?: Date | null) {
  const date = value ?? new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function TransactionShipmentForm({
  transactionId,
  lines,
  customerName,
  customerAddress,
  customerSnapshot,
  shipmentId,
  initialPlannedShipAt,
  initialItems = [],
  initialDetails = emptyDeliveryDetails,
}: {
  transactionId: string;
  lines: Line[];
  customerName: string;
  customerAddress: string;
  customerSnapshot?: TransactionCustomerSnapshot | null;
  shipmentId?: string;
  initialPlannedShipAt?: Date | null;
  initialItems?: InitialItem[];
  initialDetails?: DeliveryDetails;
}) {
  const router = useRouter();
  const notify = useAdminToast();
  const id = useId();
  const [result, formAction, pending] = useActionState(saveShipmentInline, initialAction);
  const [operationKey] = useState(() => crypto.randomUUID());
  const primaryContact =
    customerSnapshot?.contacts.find((contact) => contact.isPrimary) ?? customerSnapshot?.contacts[0];
  const primaryAddress =
    customerSnapshot?.deliveryAddresses.find((item) => item.id === customerSnapshot.selectedDeliveryAddressId) ??
    customerSnapshot?.deliveryAddresses.find((item) => item.isDefault);
  const initialRecipient = shipmentId ? customerName : primaryContact?.name || customerName;
  const initialAddress = shipmentId ? customerAddress : formatCustomerAddress(primaryAddress) || customerAddress;
  const initialContactId = initialDetails.recipientContactId || (!shipmentId ? (primaryContact?.id ?? "") : "");
  const initialAddressId = initialDetails.deliveryAddressId || (!shipmentId ? (primaryAddress?.id ?? "") : "");
  const defaultPlannedTime = useMemo(() => jakartaInputDate(initialPlannedShipAt), [initialPlannedShipAt]);
  const [recipient, setRecipient] = useState(initialRecipient);
  const [address, setAddress] = useState(initialAddress);
  const [contactId, setContactId] = useState(initialContactId);
  const [addressId, setAddressId] = useState(initialAddressId);
  const [details, setDetails] = useState(initialDetails);
  const [plannedTime, setPlannedTime] = useState(defaultPlannedTime);
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(
      lines.map((line) => [
        line.id,
        initialItems.find((item) => item.lineId === line.id)?.quantity ??
          (line.remaining > 0 && !shipmentId ? String(line.remaining) : ""),
      ]),
    ),
  );
  const [logistics, setLogistics] = useState<Record<string, ShipmentLogistics>>(
    Object.fromEntries(initialItems.map((item) => [item.lineId, item.logistics])),
  );
  const initialDraft = useMemo(
    () => ({
      quantities: Object.fromEntries(
        lines.map((line) => [
          line.id,
          initialItems.find((item) => item.lineId === line.id)?.quantity ??
            (line.remaining > 0 && !shipmentId ? String(line.remaining) : ""),
        ]),
      ),
      logistics: Object.fromEntries(initialItems.map((item) => [item.lineId, item.logistics])),
      recipient: initialRecipient,
      address: initialAddress,
      contactId: initialContactId,
      addressId: initialAddressId,
      details: initialDetails,
      plannedTime: defaultPlannedTime,
    }),
    [
      defaultPlannedTime,
      initialAddress,
      initialAddressId,
      initialContactId,
      initialDetails,
      initialItems,
      initialRecipient,
      lines,
      shipmentId,
    ],
  );
  const restore = useCallback((draft: typeof initialDraft) => {
    setQuantities(draft.quantities);
    setLogistics(draft.logistics);
    setRecipient(draft.recipient);
    setAddress(draft.address);
    setContactId(draft.contactId);
    setAddressId(draft.addressId);
    setDetails(draft.details);
    setPlannedTime(draft.plannedTime);
  }, []);
  const { restored, discard, clear } = useTransactionDraft({
    key: `${transactionId}:shipment:${shipmentId ?? "new"}`,
    value: { quantities, logistics, recipient, address, contactId, addressId, details, plannedTime },
    initial: initialDraft,
    restore,
  });
  const selected = lines
    .filter((line) => Number(quantities[line.id] ?? 0) > 0)
    .map((line) => ({
      lineId: line.id,
      quantity: quantities[line.id],
      logistics: logistics[line.id] ?? emptyLogistics,
    }));
  const packErrors = Object.fromEntries(
    lines.map((line) => [
      line.id,
      shipmentPackError(logistics[line.id] ?? emptyLogistics, quantities[line.id] ?? "", line.unit),
    ]),
  );
  const hasPackError = Object.values(packErrors).some(Boolean);

  useEffect(() => {
    if (!result.message) return;
    notify({
      title: result.ok ? "Pengiriman tersimpan" : "Periksa pengiriman",
      message: result.message,
      tone: result.ok ? "success" : "error",
    });
    if (result.ok) {
      clear();
      router.refresh();
    }
  }, [clear, notify, result, router]);

  const setLogistic = (lineId: string, field: keyof ShipmentLogistics, value: string) => {
    setLogistics((current) => ({ ...current, [lineId]: { ...(current[lineId] ?? emptyLogistics), [field]: value } }));
  };

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="transaction-shipment-form"
      data-controlled-draft="true"
      onSubmit={(event) => {
        if (hasPackError) event.preventDefault();
      }}
    >
      <input name="transactionId" type="hidden" value={transactionId} />
      <input name="operationKey" type="hidden" value={operationKey} />
      {shipmentId ? <input name="shipmentId" type="hidden" value={shipmentId} /> : null}
      <input name="items" type="hidden" value={JSON.stringify(selected)} />
      <input name="recipientContactId" type="hidden" value={contactId} />
      <input name="deliveryAddressId" type="hidden" value={addressId} />
      {restored ? (
        <div className="transaction-draft-restored" role="status">
          Draft belum disimpan dipulihkan.{" "}
          <button onClick={discard} type="button">
            Buang draft
          </button>
        </div>
      ) : null}
      {result.message ? (
        <p
          className={result.ok ? "transaction-inline-success" : "transaction-inline-error"}
          role={result.ok ? "status" : "alert"}
        >
          {result.message}
        </p>
      ) : null}
      <p>
        Jumlah barang wajib. Data kemasan dan berat boleh dikosongkan bila belum diketahui; surat tidak akan menebaknya.
      </p>
      <div className="transaction-shipment-form__lines">
        {lines.map((line) => {
          const detail = logistics[line.id] ?? emptyLogistics;
          return (
            <fieldset className="transaction-shipment-form__line" key={line.id}>
              <legend>{line.description}</legend>
              <label>
                <span>
                  Jumlah dikirim ({line.unit}) · tersedia {line.remaining}
                </span>
                <input
                  aria-label={`Jumlah dikirim: ${line.description}`}
                  aria-describedby={packErrors[line.id] ? `${id}-${line.id}-pack-error` : undefined}
                  aria-invalid={Boolean(packErrors[line.id])}
                  disabled={line.remaining <= 0}
                  inputMode="decimal"
                  max={line.remaining}
                  min="0"
                  onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))}
                  step="0.001"
                  type="number"
                  value={quantities[line.id] ?? ""}
                />
              </label>
              <div className="transaction-shipment-form__logistics">
                {(
                  [
                    ["karungCount", "Karung"],
                    ["packCount", "Pack / plastik"],
                    ["piecesPerPack", "Isi per pack (pcs)"],
                    ["grossKg", "Berat bruto (kg)"],
                    ["netKg", "Berat neto (kg)"],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field}>
                    {label}
                    <input
                      inputMode="decimal"
                      min="0"
                      onChange={(event) => setLogistic(line.id, field, event.target.value)}
                      step={field === "grossKg" || field === "netKg" ? "0.001" : "1"}
                      type="number"
                      value={detail[field]}
                    />
                  </label>
                ))}
                <label>
                  Keterangan barang
                  <input
                    maxLength={300}
                    onChange={(event) => setLogistic(line.id, "remark", event.target.value)}
                    type="text"
                    value={detail.remark}
                  />
                </label>
              </div>
              {packErrors[line.id] ? (
                <p className="transaction-inline-error" id={`${id}-${line.id}-pack-error`} role="alert">
                  {packErrors[line.id]}
                </p>
              ) : null}
              {result.fieldErrors[`items:${line.id}`] ? (
                <p className="transaction-inline-error" role="alert">
                  {result.fieldErrors[`items:${line.id}`]}
                </p>
              ) : null}
            </fieldset>
          );
        })}
      </div>
      {result.fieldErrors.items ? (
        <p className="transaction-inline-error" role="alert">
          {result.fieldErrors.items}
        </p>
      ) : null}
      <div className="transaction-shipment-form__destination">
        {customerSnapshot?.contacts?.length ? (
          <label>
            Pilih PIC dari data transaksi
            <select
              value={contactId}
              onChange={(event) => {
                setContactId(event.target.value);
                const contact = customerSnapshot.contacts.find((item) => item.id === event.target.value);
                if (contact) setRecipient(contact.name);
              }}
            >
              <option value="">Isi sendiri</option>
              {customerSnapshot.contacts.map((contact, index) => (
                <option key={contact.id ?? index} value={contact.id ?? `snapshot-${index}`}>
                  {contact.name}
                  {contact.isPrimary ? " · PIC utama" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Nama penerima (PIC)
          <input
            maxLength={160}
            name="recipient"
            onChange={(event) => setRecipient(event.target.value)}
            required
            value={recipient}
          />
          {result.fieldErrors.recipient ? (
            <small className="transaction-inline-error">{result.fieldErrors.recipient}</small>
          ) : null}
        </label>
        {customerSnapshot?.deliveryAddresses?.length ? (
          <label>
            Pilih alamat dari data transaksi
            <select
              value={addressId}
              onChange={(event) => {
                setAddressId(event.target.value);
                const option = customerSnapshot.deliveryAddresses.find((item) => item.id === event.target.value);
                if (option) setAddress(formatCustomerAddress(option));
              }}
            >
              <option value="">Isi sendiri</option>
              {customerSnapshot.deliveryAddresses.map((option, index) => (
                <option key={option.id ?? index} value={option.id ?? `snapshot-${index}`}>
                  {option.label || `Alamat ${index + 1}`}
                  {option.isDefault ? " · default" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Alamat pengiriman
          <textarea
            maxLength={1000}
            name="address"
            onChange={(event) => setAddress(event.target.value)}
            required
            rows={3}
            value={address}
          />
          {result.fieldErrors.address ? (
            <small className="transaction-inline-error">{result.fieldErrors.address}</small>
          ) : null}
        </label>
        <label>
          Tanggal dan jam rencana pengiriman · WIB
          <input
            name="plannedShipAt"
            onChange={(event) => setPlannedTime(event.target.value)}
            required
            type="datetime-local"
            value={plannedTime}
          />
          {result.fieldErrors.plannedShipAt ? (
            <small className="transaction-inline-error">{result.fieldErrors.plannedShipAt}</small>
          ) : null}
        </label>
        <label>
          Nomor Delivery Order (jika ada)
          <input
            maxLength={80}
            name="deliveryOrderNo"
            onChange={(event) => setDetails((current) => ({ ...current, deliveryOrderNo: event.target.value }))}
            value={details.deliveryOrderNo}
          />
        </label>
        <label>
          Nama pengirim
          <input
            maxLength={120}
            name="senderName"
            onChange={(event) => setDetails((current) => ({ ...current, senderName: event.target.value }))}
            value={details.senderName}
          />
        </label>
        <label>
          Nama supir
          <input
            maxLength={120}
            name="driverName"
            onChange={(event) => setDetails((current) => ({ ...current, driverName: event.target.value }))}
            value={details.driverName}
          />
        </label>
        <label>
          Nomor polisi kendaraan
          <input
            maxLength={32}
            name="vehiclePlate"
            onChange={(event) => setDetails((current) => ({ ...current, vehiclePlate: event.target.value }))}
            value={details.vehiclePlate}
          />
        </label>
        <label>
          Nama penerima untuk ruang tanda tangan
          <input
            maxLength={120}
            name="receiverSignatureName"
            onChange={(event) => setDetails((current) => ({ ...current, receiverSignatureName: event.target.value }))}
            value={details.receiverSignatureName}
          />
        </label>
        <label>
          Catatan pengiriman
          <textarea
            maxLength={1500}
            name="note"
            onChange={(event) => setDetails((current) => ({ ...current, note: event.target.value }))}
            rows={2}
            value={details.note}
          />
        </label>
      </div>
      <button disabled={!selected.length || hasPackError || pending} type="submit">
        {pending ? "Menyimpan…" : shipmentId ? "Simpan koreksi pengiriman" : "Siapkan pengiriman"}
      </button>
    </form>
  );
}
