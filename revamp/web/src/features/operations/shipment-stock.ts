export type ShipmentStockLine = { id: string; quantity: string };
export type ShipmentStockBatch = {
  transactionLineId: string | null;
  kind: string;
  status: string;
  completedQuantity: string | null;
};
export type ShipmentStockAllocation = {
  lineId: string;
  quantity: string;
  shipmentId: string;
  status?: string;
  acceptedQuantity?: string | null;
};

const mills = (value: string | null) => Math.round(Number(value ?? 0) * 1000);

export function shipmentAvailableByLine(
  lines: ShipmentStockLine[],
  batches: ShipmentStockBatch[],
  allocations: ShipmentStockAllocation[],
  excludingShipmentId?: string,
) {
  return new Map(
    lines.map((line) => {
      const produced = batches
        .filter(
          (batch) => batch.kind === "production" && batch.status === "completed" && batch.transactionLineId === line.id,
        )
        .reduce((total, batch) => total + mills(batch.completedQuantity), 0);
      const allocated = allocations
        .filter((allocation) => allocation.lineId === line.id && allocation.shipmentId !== excludingShipmentId)
        .reduce(
          (total, allocation) =>
            total +
            mills(
              allocation.status === "received_partial" || allocation.status === "received"
                ? (allocation.acceptedQuantity ?? allocation.quantity)
                : allocation.quantity,
            ),
          0,
        );
      const available = Math.max(0, Math.min(mills(line.quantity) - allocated, produced - allocated));
      return [line.id, available / 1000] as const;
    }),
  );
}
