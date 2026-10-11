"use client";

import { useState } from "react";
import { createShipment, updatePlannedShipment } from "@/features/operations/workflow-actions";
import {
  emptyDeliveryDetails,
  emptyLogistics,
  type DeliveryDetails,
  type ShipmentLogistics,
} from "@/features/operations/delivery-note";

type Line = { id: string; description: string; unit: string; remaining: number };
type InitialItem = { lineId: string; quantity: string; logistics: ShipmentLogistics };

export function TransactionShipmentForm({
  transactionId,
  lines,
  customerName,
  customerAddress,
  shipmentId,
  initialItems = [],
  initialDetails = emptyDeliveryDetails,
}: {
  transactionId: string;
  lines: Line[];
  customerName: string;
  customerAddress: string;
  shipmentId?: string;
  initialItems?: InitialItem[];
  initialDetails?: DeliveryDetails;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(initialItems.map((item) => [item.lineId, item.quantity])),
  );
  const [logistics, setLogistics] = useState<Record<string, ShipmentLogistics>>(
    Object.fromEntries(initialItems.map((item) => [item.lineId, item.logistics])),
  );
  const selected = lines
    .filter((line) => Number(quantities[line.id] ?? 0) > 0)
    .map((line) => ({
      lineId: line.id,
      quantity: quantities[line.id],
      logistics: logistics[line.id] ?? emptyLogistics,
    }));

  const setLogistic = (lineId: string, field: keyof ShipmentLogistics, value: string) => {
    setLogistics((current) => ({ ...current, [lineId]: { ...(current[lineId] ?? emptyLogistics), [field]: value } }));
  };

  return (
    <form action={shipmentId ? updatePlannedShipment : createShipment} className="transaction-shipment-form">
      <input name="transactionId" type="hidden" value={transactionId} />
      {shipmentId ? <input name="shipmentId" type="hidden" value={shipmentId} /> : null}
      <input name="items" type="hidden" value={JSON.stringify(selected)} />
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
            </fieldset>
          );
        })}
      </div>
      <div className="transaction-shipment-form__destination">
        <label>
          Penerima / perusahaan tujuan
          <input defaultValue={customerName} maxLength={160} name="recipient" required />
        </label>
        <label>
          Alamat pengiriman
          <textarea defaultValue={customerAddress} maxLength={1000} name="address" required rows={3} />
        </label>
        <label>
          Nomor Delivery Order (jika ada)
          <input defaultValue={initialDetails.deliveryOrderNo} maxLength={80} name="deliveryOrderNo" />
        </label>
        <label>
          Nama pengirim
          <input defaultValue={initialDetails.senderName} maxLength={120} name="senderName" />
        </label>
        <label>
          Nama supir
          <input defaultValue={initialDetails.driverName} maxLength={120} name="driverName" />
        </label>
        <label>
          Nomor polisi kendaraan
          <input defaultValue={initialDetails.vehiclePlate} maxLength={32} name="vehiclePlate" />
        </label>
        <label>
          Nama penerima untuk ruang tanda tangan
          <input defaultValue={initialDetails.receiverSignatureName} maxLength={120} name="receiverSignatureName" />
        </label>
        <label>
          Catatan pengiriman
          <textarea defaultValue={initialDetails.note} maxLength={1500} name="note" rows={2} />
        </label>
      </div>
      <button disabled={!selected.length} type="submit">
        {shipmentId ? "Simpan koreksi pengiriman" : "Siapkan pengiriman"}
      </button>
    </form>
  );
}
