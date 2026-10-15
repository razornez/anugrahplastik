"use client";

type CachedRow = {
  id: string;
  title: string;
  referenceNo: string;
  customerName: string;
  stage: string;
  payment: string;
};
type Snapshot = { userId: string; rows: CachedRow[]; capturedAt: number };
let activeUserId: string | null = null;
let listSnapshot: Snapshot | null = null;
const dirtyKeys = new Set<string>();

export function scopeTransactionSession(userId: string | null) {
  if (activeUserId !== userId) {
    listSnapshot = null;
    dirtyKeys.clear();
    activeUserId = userId;
  }
}
export function captureTransactionList(rows: CachedRow[]) {
  if (activeUserId) listSnapshot = { userId: activeUserId, rows, capturedAt: Date.now() };
}
export function getCachedTransactionList() {
  return listSnapshot?.userId === activeUserId ? listSnapshot : null;
}
export function invalidateTransactionList() {
  listSnapshot = null;
}
export function markTransactionDraftDirty(key: string, dirty: boolean) {
  if (dirty) dirtyKeys.add(key);
  else dirtyKeys.delete(key);
}
export function hasDirtyTransactionDraft() {
  return dirtyKeys.size > 0;
}
export function clearTransactionDraftMarks() {
  dirtyKeys.clear();
}
