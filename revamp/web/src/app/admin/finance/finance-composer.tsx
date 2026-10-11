"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { createFinanceEntry } from "@/features/finance/actions";
import styles from "./finance.module.css";

type Account = { id: string; name: string };
type Category = { code: string; name: string; direction: string };
type Supplier = { id: string; name: string };

type FinanceComposerProps = {
  accounts: Account[];
  categories: Category[];
  suppliers: Supplier[];
  defaultDate: string;
};

function CloseButton() {
  return (
    <Dialog.Close className={styles.dialogClose} type="button" aria-label="Tutup formulir">
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    </Dialog.Close>
  );
}

export function FinanceComposer({ accounts, categories, suppliers, defaultDate }: FinanceComposerProps) {
  const [entryOpen, setEntryOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);

  return (
    <section className={styles.composer} aria-label="Pencatatan keuangan">
      <div className={styles.composerIntro}>
        <p className={styles.eyebrow}>PENCATATAN</p>
        <h2>Tambah catatan saat dibutuhkan</h2>
        <p>Pilih kategori “Payroll” untuk mencatat gaji sebagai pengeluaran, tanpa form terpisah.</p>
      </div>
      <div ref={setPortalContainer} className={styles.dialogPortal}>
        <div className={styles.composerActions}>
          <Dialog.Root open={entryOpen} onOpenChange={setEntryOpen}>
            <Dialog.Trigger asChild>
              <button className={styles.primary} type="button">
                Catat transaksi
              </button>
            </Dialog.Trigger>
            <Dialog.Portal container={portalContainer ?? undefined}>
              <Dialog.Overlay className={styles.dialogBackdrop} />
              <Dialog.Content className={styles.dialogContent} aria-describedby="catat-transaksi-description">
                <div className={styles.dialogHead}>
                  <div>
                    <Dialog.Title>Catat transaksi</Dialog.Title>
                    <Dialog.Description id="catat-transaksi-description">
                      Catatan baru menunggu verifikasi sebelum memengaruhi saldo buku.
                    </Dialog.Description>
                  </div>
                  <CloseButton />
                </div>
                <form action={createFinanceEntry} className={styles.formGrid}>
                  <label>
                    Rekening
                    <select name="accountId" required>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Kategori
                    <select name="categoryCode" required defaultValue="other_expense">
                      {categories.map((category) => (
                        <option key={category.code} value={category.code}>
                          {category.name} · {category.direction === "in" ? "masuk" : "keluar"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Jenis catatan
                    <select name="kind" defaultValue="bank_movement">
                      <option value="bank_movement">Catatan bank</option>
                      <option value="vendor_bill">Pembayaran vendor</option>
                      <option value="payroll">Payroll</option>
                      <option value="owner_draw">Prive owner</option>
                      <option value="opening_balance">Saldo awal</option>
                    </select>
                  </label>
                  <label>
                    Nominal
                    <input name="amount" inputMode="decimal" required placeholder="0" />
                  </label>
                  <label>
                    Tanggal
                    <input type="date" name="occurredAt" required defaultValue={defaultDate} />
                  </label>
                  <label>
                    Pihak terkait
                    <input name="counterpartyName" placeholder="Nama pelanggan, vendor, atau owner" />
                  </label>
                  <label>
                    Referensi
                    <input name="reference" placeholder="Nomor mutasi / kuitansi" />
                  </label>
                  <label className={styles.full}>
                    Vendor (opsional)
                    <select name="supplierId" defaultValue="">
                      <option value="">Tidak terkait vendor</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className={styles.formHint}>
                    Arah uang mengikuti kategori: pemasukan menambah saldo, pengeluaran menguranginya.
                  </p>
                  <label className={styles.full}>
                    Keterangan
                    <textarea name="notes" rows={3} placeholder="Jelaskan tujuan dan konteks transaksi." />
                  </label>
                  <button className={styles.primary} type="submit">
                    Simpan untuk verifikasi
                  </button>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </section>
  );
}
