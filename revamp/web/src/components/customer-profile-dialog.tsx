"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AdminSheet, useAdminToast } from "@/components/admin-ui";
import { saveCustomerProfile } from "@/features/operations/customer-profile-actions";
import {
  customerProfileComplete,
  type CustomerAddressInput,
  type CustomerContactInput,
  type CustomerProfileActionState,
  type CustomerProfileInput,
} from "@/features/operations/customer-profile";

type DeleteAction = (formData: FormData) => void | Promise<void>;
type RegionLevel = "province" | "regency" | "district" | "village";
type RegionOption = { code: string; name: string; postalCode?: string | null };

const emptyContact = (): CustomerContactInput => ({
  name: "",
  position: "",
  email: "",
  phone: "",
  isPrimary: true,
});

const emptyAddress = (kind: "billing" | "delivery", label: string): CustomerAddressInput => ({
  kind,
  label,
  countryCode: "ID",
  countryName: "Indonesia",
  addressLine: "",
  provinceCode: "",
  provinceName: "",
  regencyCode: "",
  regencyName: "",
  districtCode: "",
  districtName: "",
  villageCode: "",
  villageName: "",
  postalCode: "",
  isDefault: kind === "billing",
  isStructured: true,
});

function blankProfile(): CustomerProfileInput {
  return {
    name: "",
    taxId: "",
    status: "active",
    contacts: [emptyContact()],
    billingAddress: emptyAddress("billing", "Kantor utama"),
    deliveryAddresses: [],
  };
}

function RegionSelect({
  label,
  level,
  parentCode,
  value,
  disabled,
  onChange,
  inputId,
  error,
}: {
  label: string;
  level: RegionLevel;
  parentCode?: string;
  value: string;
  disabled?: boolean;
  onChange: (option: RegionOption | null) => void;
  inputId: string;
  error?: string;
}) {
  const [lookup, setLookup] = useState<{
    key: string;
    options: RegionOption[];
    status: "ready" | "error";
  } | null>(null);
  const key = `${level}:${parentCode ?? ""}`;
  const hasParent = level === "province" || Boolean(parentCode);
  const options = hasParent && lookup?.key === key ? lookup.options : [];
  const status = !hasParent ? "idle" : lookup?.key === key ? lookup.status : "loading";

  useEffect(() => {
    if (level !== "province" && !parentCode) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ level });
    if (parentCode) query.set("parentCode", parentCode);
    fetch(`/api/admin/regions?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Wilayah gagal dimuat.");
        return (await response.json()) as { options?: RegionOption[] };
      })
      .then((payload) => {
        setLookup({ key: `${level}:${parentCode ?? ""}`, options: payload.options ?? [], status: "ready" });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLookup({ key: `${level}:${parentCode ?? ""}`, options: [], status: "error" });
        }
      });
    return () => controller.abort();
  }, [level, parentCode]);

  return (
    <label>
      {label}
      <select
        aria-describedby={error ? `${inputId}-error` : undefined}
        aria-invalid={Boolean(error)}
        aria-busy={status === "loading"}
        disabled={disabled || status === "loading"}
        id={inputId}
        onChange={(event) => onChange(options.find((option) => option.code === event.target.value) ?? null)}
        value={value}
      >
        <option value="">
          {status === "loading" ? "Memuat pilihan…" : `Pilih ${label.toLocaleLowerCase("id-ID")}`}
        </option>
        {value && !options.some((option) => option.code === value) ? (
          <option value={value}>Pilihan tersimpan</option>
        ) : null}
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </select>
      {error ? (
        <small className="customer-field-error" id={`${inputId}-error`}>
          {error}
        </small>
      ) : null}
      <small aria-live="polite" className="customer-region-status">
        {status === "error"
          ? "Pilihan gagal dimuat. Tutup lalu buka kembali formulir."
          : status === "ready" && options.length === 0
            ? "Belum ada pilihan untuk wilayah induk ini."
            : disabled
              ? "Pilih wilayah sebelumnya terlebih dahulu."
              : ""}
      </small>
    </label>
  );
}

function AddressFields({
  address,
  onChange,
  onRemove,
  errorPrefix,
  fieldErrors,
}: {
  address: CustomerAddressInput;
  onChange: (address: CustomerAddressInput) => void;
  onRemove?: () => void;
  errorPrefix: string;
  fieldErrors?: Record<string, string>;
}) {
  const isIndonesia = address.countryCode === "ID";
  const update = (patch: Partial<CustomerAddressInput>) => onChange({ ...address, ...patch });
  return (
    <fieldset className="customer-profile-address">
      <legend>{address.kind === "billing" ? "Alamat penagihan" : address.label || "Alamat pengiriman"}</legend>
      <div className="customer-profile-grid customer-profile-grid--compact">
        <label>
          Label lokasi
          <input
            aria-describedby={
              fieldErrors?.[`${errorPrefix}.label`] ? `customer-field-${errorPrefix}-label-error` : undefined
            }
            aria-invalid={Boolean(fieldErrors?.[`${errorPrefix}.label`])}
            id={`customer-field-${errorPrefix}-label`}
            maxLength={100}
            onChange={(event) => update({ label: event.target.value })}
            required
            value={address.label}
          />
          {fieldErrors?.[`${errorPrefix}.label`] ? (
            <small className="customer-field-error" id={`customer-field-${errorPrefix}-label-error`}>
              {fieldErrors[`${errorPrefix}.label`]}
            </small>
          ) : null}
        </label>
        <label>
          Negara
          <select
            onChange={(event) => {
              const indonesia = event.target.value === "ID";
              update({
                countryCode: indonesia ? "ID" : address.countryCode === "ID" ? "" : address.countryCode,
                countryName: indonesia ? "Indonesia" : address.countryCode === "ID" ? "" : address.countryName,
                provinceCode: "",
                provinceName: "",
                regencyCode: "",
                regencyName: "",
                districtCode: "",
                districtName: "",
                villageCode: "",
                villageName: "",
                isStructured: indonesia,
              });
            }}
            value={isIndonesia ? "ID" : "OTHER"}
          >
            <option value="ID">Indonesia</option>
            <option value="OTHER">Luar Indonesia</option>
          </select>
        </label>
      </div>
      {!isIndonesia ? (
        <div className="customer-profile-grid customer-profile-grid--compact">
          <label>
            Kode negara ISO
            <input
              aria-describedby="customer-country-code-help"
              maxLength={2}
              onChange={(event) => update({ countryCode: event.target.value.toUpperCase() })}
              placeholder="SG"
              required
              value={address.countryCode}
            />
            <small id="customer-country-code-help">Dua huruf, misalnya SG, MY, atau US.</small>
          </label>
          <label>
            Nama negara
            <input
              maxLength={120}
              onChange={(event) => update({ countryName: event.target.value })}
              required
              value={address.countryName}
            />
          </label>
        </div>
      ) : null}
      <label>
        Alamat jalan / gedung
        <textarea
          aria-describedby={
            fieldErrors?.[`${errorPrefix}.addressLine`] ? `customer-field-${errorPrefix}-addressLine-error` : undefined
          }
          aria-invalid={Boolean(fieldErrors?.[`${errorPrefix}.addressLine`])}
          id={`customer-field-${errorPrefix}-addressLine`}
          maxLength={1200}
          onChange={(event) => update({ addressLine: event.target.value })}
          placeholder={
            isIndonesia ? "Nama jalan, nomor, gedung, atau kawasan" : "Tulis alamat lengkap sesuai format negara tujuan"
          }
          required
          rows={2}
          value={address.addressLine}
        />
        {fieldErrors?.[`${errorPrefix}.addressLine`] ? (
          <small className="customer-field-error" id={`customer-field-${errorPrefix}-addressLine-error`}>
            {fieldErrors[`${errorPrefix}.addressLine`]}
          </small>
        ) : null}
      </label>
      {isIndonesia ? (
        <div className="customer-profile-grid">
          <RegionSelect
            error={fieldErrors?.[`${errorPrefix}.provinceCode`]}
            inputId={`customer-field-${errorPrefix}-provinceCode`}
            label="Provinsi"
            level="province"
            onChange={(option) =>
              update({
                provinceCode: option?.code ?? "",
                provinceName: option?.name ?? "",
                regencyCode: "",
                regencyName: "",
                districtCode: "",
                districtName: "",
                villageCode: "",
                villageName: "",
                postalCode: "",
              })
            }
            value={address.provinceCode}
          />
          <RegionSelect
            disabled={!address.provinceCode}
            error={fieldErrors?.[`${errorPrefix}.regencyCode`]}
            inputId={`customer-field-${errorPrefix}-regencyCode`}
            label="Kabupaten / kota"
            level="regency"
            onChange={(option) =>
              update({
                regencyCode: option?.code ?? "",
                regencyName: option?.name ?? "",
                districtCode: "",
                districtName: "",
                villageCode: "",
                villageName: "",
                postalCode: "",
              })
            }
            parentCode={address.provinceCode}
            value={address.regencyCode}
          />
          <RegionSelect
            disabled={!address.regencyCode}
            error={fieldErrors?.[`${errorPrefix}.districtCode`]}
            inputId={`customer-field-${errorPrefix}-districtCode`}
            label="Kecamatan"
            level="district"
            onChange={(option) =>
              update({
                districtCode: option?.code ?? "",
                districtName: option?.name ?? "",
                villageCode: "",
                villageName: "",
                postalCode: "",
              })
            }
            parentCode={address.regencyCode}
            value={address.districtCode}
          />
          <RegionSelect
            disabled={!address.districtCode}
            error={fieldErrors?.[`${errorPrefix}.villageCode`]}
            inputId={`customer-field-${errorPrefix}-villageCode`}
            label="Kelurahan / desa"
            level="village"
            onChange={(option) =>
              update({
                villageCode: option?.code ?? "",
                villageName: option?.name ?? "",
                postalCode: option?.postalCode ?? "",
              })
            }
            parentCode={address.districtCode}
            value={address.villageCode}
          />
          <label>
            Kode pos
            <input
              inputMode="numeric"
              maxLength={12}
              onChange={(event) => update({ postalCode: event.target.value })}
              value={address.postalCode}
            />
          </label>
        </div>
      ) : (
        <label>
          Kode pos
          <input
            maxLength={12}
            onChange={(event) => update({ postalCode: event.target.value })}
            value={address.postalCode}
          />
        </label>
      )}
      {address.kind === "delivery" ? (
        <div className="customer-profile-address__actions">
          <label className="admin-check-row">
            <input
              checked={address.isDefault}
              onChange={(event) => update({ isDefault: event.target.checked })}
              type="checkbox"
            />
            Jadikan alamat pengiriman utama
          </label>
          {onRemove ? (
            <button
              aria-label={`Hapus alamat pengiriman ${address.label || "ini"}`}
              className="customer-profile-address__remove"
              onClick={onRemove}
              type="button"
            >
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path d="M4.5 7h15M9 7V4.75h6V7m2.5 0-.75 12.25H7.25L6.5 7M9.5 10.5v5.75m5-5.75v5.75" />
              </svg>
              Hapus alamat
            </button>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

export function CustomerProfileDialog({
  profile: initialProfile,
  canDelete = false,
  deleteAction,
  triggerLabel,
}: {
  profile?: CustomerProfileInput;
  canDelete?: boolean;
  deleteAction?: DeleteAction;
  triggerLabel: string;
}) {
  const router = useRouter();
  const notify = useAdminToast();
  const summaryId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<CustomerProfileInput>(() => initialProfile ?? blankProfile());
  const [state, setState] = useState<CustomerProfileActionState>({ ok: false });
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const isComplete = useMemo(() => customerProfileComplete(profile), [profile]);

  useEffect(() => {
    if (state.message && !state.ok) summaryRef.current?.focus();
  }, [state]);

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      setProfile(initialProfile ?? blankProfile());
      setState({ ok: false });
      setConfirmDelete(false);
      setDeleteError("");
    }
    setOpen(nextOpen);
  }

  function updateContact(index: number, patch: Partial<CustomerContactInput>) {
    setProfile((current) => {
      const contacts = current.contacts.map((contact, contactIndex) =>
        contactIndex === index
          ? { ...contact, ...patch }
          : patch.isPrimary
            ? { ...contact, isPrimary: false }
            : contact,
      );
      return { ...current, contacts };
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setState({ ok: false });
    try {
      const formData = new FormData();
      formData.set("profile", JSON.stringify(profile));
      const result = await saveCustomerProfile(formData);
      setState(result);
      if (!result.ok) return;
      notify({ title: "Data pelanggan tersimpan", message: result.message, tone: "success" });
      setOpen(false);
      router.refresh();
    } catch {
      setState({ ok: false, message: "Koneksi terputus. Perubahan belum tersimpan; coba lagi." });
    } finally {
      setPending(false);
    }
  }

  async function removeCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deleteAction || !initialProfile?.id) return;
    setPending(true);
    setDeleteError("");
    try {
      await deleteAction(new FormData(event.currentTarget));
      notify({ title: "Pelanggan dihapus", tone: "success" });
      setOpen(false);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setDeleteError(
        message.includes("masih dipakai oleh pekerjaan atau file")
          ? "Pelanggan masih dipakai transaksi atau file. Nonaktifkan pelanggan untuk menjaga riwayat."
          : "Pelanggan belum dapat dihapus. Periksa koneksi lalu coba lagi.",
      );
    } finally {
      setPending(false);
    }
  }

  function errorTarget(path: string) {
    if (
      path === "name" ||
      /^contacts\.\d+\.(name|email)$/.test(path) ||
      /^(billingAddress|deliveryAddresses\.\d+)\.(label|addressLine|provinceCode|regencyCode|districtCode|villageCode)$/.test(
        path,
      )
    )
      return `customer-field-${path.replace(/\.(label|addressLine|provinceCode|regencyCode|districtCode|villageCode)$/, "-$1")}`;
    if (path.startsWith("contacts")) return "customer-profile-contacts";
    if (path.startsWith("deliveryAddresses")) return "customer-profile-delivery";
    return "customer-profile-billing";
  }

  return (
    <>
      <button
        className={
          initialProfile
            ? "directory-manage"
            : "master-primary-action admin-primary-button customer-profile-create-action"
        }
        onClick={() => changeOpen(true)}
        type="button"
      >
        {!initialProfile ? (
          <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
          </svg>
        ) : null}
        {triggerLabel}
      </button>
      <AdminSheet
        className="admin-sheet--customer-profile"
        description="Profil, PIC, dan alamat ini menjadi sumber awal untuk transaksi baru."
        onOpenChange={changeOpen}
        open={open}
        title={initialProfile ? `Kelola ${initialProfile.name}` : "Tambah pelanggan"}
      >
        <form
          aria-describedby={state.message ? summaryId : undefined}
          className="customer-profile-form"
          noValidate
          onSubmit={submit}
        >
          {state.message && !state.ok ? (
            <div
              className="admin-form-error-summary customer-profile-error-summary"
              id={summaryId}
              ref={summaryRef}
              role="alert"
              tabIndex={-1}
            >
              <strong>{Object.keys(state.fieldErrors ?? {}).length ? "Periksa bagian berikut:" : state.message}</strong>
              {state.fieldErrors ? (
                <ul>
                  {Object.entries(state.fieldErrors).map(([path, message]) => (
                    <li key={path}>
                      <a href={`#${errorTarget(path)}`}>{message}</a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <nav aria-label="Bagian formulir pelanggan" className="customer-profile-overview">
            <a href="#customer-profile-identity">
              <span>01</span>Profil
            </a>
            <a href="#customer-profile-contacts">
              <span>02</span>PIC
            </a>
            <a href="#customer-profile-billing">
              <span>03</span>Penagihan
            </a>
            <a href="#customer-profile-delivery">
              <span>04</span>Pengiriman
            </a>
          </nav>
          <section className="customer-profile-section" id="customer-profile-identity">
            <div className="customer-profile-section__heading">
              <div className="customer-profile-section__title">
                <span aria-hidden="true">01</span>
                <div>
                  <h3>Profil perusahaan</h3>
                  <p>Identitas utama yang tampil pada transaksi dan dokumen.</p>
                </div>
              </div>
              <em data-complete={isComplete}>{isComplete ? "Lengkap" : "Perlu dilengkapi"}</em>
            </div>
            <div className="customer-profile-grid customer-profile-grid--profile">
              <label>
                Nama pelanggan
                <input
                  aria-describedby={state.fieldErrors?.name ? "customer-field-name-error" : undefined}
                  aria-invalid={Boolean(state.fieldErrors?.name)}
                  autoFocus
                  id="customer-field-name"
                  maxLength={180}
                  onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))}
                  required
                  value={profile.name}
                />
                {state.fieldErrors?.name ? (
                  <small className="customer-field-error" id="customer-field-name-error">
                    {state.fieldErrors.name}
                  </small>
                ) : null}
              </label>
              <label>
                NPWP <small>(opsional)</small>
                <input
                  maxLength={32}
                  onChange={(event) => setProfile((current) => ({ ...current, taxId: event.target.value }))}
                  value={profile.taxId}
                />
              </label>
              <label>
                Status
                <select
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      status: event.target.value === "inactive" ? "inactive" : "active",
                    }))
                  }
                  value={profile.status}
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </select>
              </label>
            </div>
          </section>

          <section className="customer-profile-section" id="customer-profile-contacts">
            <div className="customer-profile-section__heading">
              <div className="customer-profile-section__title">
                <span aria-hidden="true">02</span>
                <div>
                  <h3>Kontak / PIC</h3>
                  <p>Tentukan satu PIC utama untuk email dan komunikasi transaksi.</p>
                </div>
              </div>
              <button
                className="admin-button admin-button--ghost"
                onClick={() =>
                  setProfile((current) => ({
                    ...current,
                    contacts: [...current.contacts, { ...emptyContact(), isPrimary: false }],
                  }))
                }
                type="button"
              >
                <span aria-hidden="true">+</span> Tambah PIC
              </button>
            </div>
            <div className="customer-profile-stack">
              {profile.contacts.map((contact, index) => (
                <fieldset className="customer-profile-contact" key={contact.id ?? `contact-${index}`}>
                  <legend>PIC {index + 1}</legend>
                  <div className="customer-profile-grid">
                    <label>
                      Nama PIC
                      <input
                        aria-describedby={
                          state.fieldErrors?.[`contacts.${index}.name`]
                            ? `customer-field-contacts.${index}.name-error`
                            : undefined
                        }
                        aria-invalid={Boolean(state.fieldErrors?.[`contacts.${index}.name`])}
                        id={`customer-field-contacts.${index}.name`}
                        maxLength={120}
                        onChange={(event) => updateContact(index, { name: event.target.value })}
                        required
                        value={contact.name}
                      />
                      {state.fieldErrors?.[`contacts.${index}.name`] ? (
                        <small className="customer-field-error" id={`customer-field-contacts.${index}.name-error`}>
                          {state.fieldErrors[`contacts.${index}.name`]}
                        </small>
                      ) : null}
                    </label>
                    <label>
                      Jabatan <small>(opsional)</small>
                      <input
                        maxLength={100}
                        onChange={(event) => updateContact(index, { position: event.target.value })}
                        value={contact.position}
                      />
                    </label>
                    <label>
                      Email
                      <input
                        aria-describedby={
                          state.fieldErrors?.[`contacts.${index}.email`]
                            ? `customer-field-contacts.${index}.email-error`
                            : undefined
                        }
                        aria-invalid={Boolean(state.fieldErrors?.[`contacts.${index}.email`])}
                        id={`customer-field-contacts.${index}.email`}
                        maxLength={255}
                        onChange={(event) => updateContact(index, { email: event.target.value })}
                        type="email"
                        value={contact.email}
                      />
                      {state.fieldErrors?.[`contacts.${index}.email`] ? (
                        <small className="customer-field-error" id={`customer-field-contacts.${index}.email-error`}>
                          {state.fieldErrors[`contacts.${index}.email`]}
                        </small>
                      ) : null}
                    </label>
                    <label>
                      Telepon / WhatsApp
                      <input
                        inputMode="tel"
                        maxLength={32}
                        onChange={(event) => updateContact(index, { phone: event.target.value })}
                        value={contact.phone}
                      />
                    </label>
                  </div>
                  <div className="customer-profile-contact__actions">
                    <label className="admin-check-row">
                      <input
                        checked={contact.isPrimary}
                        onChange={() => updateContact(index, { isPrimary: true })}
                        type="radio"
                      />
                      PIC utama
                    </label>
                    {profile.contacts.length > 1 ? (
                      <button
                        className="admin-button admin-button--ghost"
                        onClick={() =>
                          setProfile((current) => {
                            const contacts = current.contacts.filter((_, contactIndex) => contactIndex !== index);
                            if (!contacts.some((item) => item.isPrimary))
                              contacts[0] = { ...contacts[0], isPrimary: true };
                            return { ...current, contacts };
                          })
                        }
                        type="button"
                      >
                        Hapus PIC
                      </button>
                    ) : null}
                  </div>
                </fieldset>
              ))}
            </div>
          </section>

          <section className="customer-profile-section" id="customer-profile-billing">
            <div className="customer-profile-section__heading">
              <div className="customer-profile-section__title">
                <span aria-hidden="true">03</span>
                <div>
                  <h3>Alamat penagihan</h3>
                  <p>Digunakan pada Invoice dan pemeriksaan kesiapan dokumen.</p>
                </div>
              </div>
            </div>
            {profile.billingAddress ? (
              <AddressFields
                address={profile.billingAddress}
                errorPrefix="billingAddress"
                fieldErrors={state.fieldErrors}
                onChange={(billingAddress) => setProfile((current) => ({ ...current, billingAddress }))}
              />
            ) : (
              <button
                className="admin-button admin-button--secondary"
                onClick={() =>
                  setProfile((current) => ({ ...current, billingAddress: emptyAddress("billing", "Kantor utama") }))
                }
                type="button"
              >
                Tambah alamat penagihan
              </button>
            )}
          </section>

          <section className="customer-profile-section" id="customer-profile-delivery">
            <div className="customer-profile-section__heading">
              <div className="customer-profile-section__title">
                <span aria-hidden="true">04</span>
                <div>
                  <h3>Alamat pengiriman</h3>
                  <p>Simpan beberapa lokasi dan pilih satu alamat utama.</p>
                </div>
              </div>
              <button
                className="admin-button admin-button--ghost"
                onClick={() =>
                  setProfile((current) => ({
                    ...current,
                    deliveryAddresses: [
                      ...current.deliveryAddresses,
                      {
                        ...emptyAddress("delivery", `Lokasi ${current.deliveryAddresses.length + 1}`),
                        isDefault: current.deliveryAddresses.length === 0,
                      },
                    ],
                  }))
                }
                type="button"
              >
                <span aria-hidden="true">+</span> Tambah alamat
              </button>
            </div>
            {profile.deliveryAddresses.length ? (
              <div className="customer-profile-stack">
                {profile.deliveryAddresses.map((address, index) => (
                  <AddressFields
                    address={address}
                    errorPrefix={`deliveryAddresses.${index}`}
                    fieldErrors={state.fieldErrors}
                    key={address.id ?? `delivery-${index}`}
                    onChange={(nextAddress) =>
                      setProfile((current) => ({
                        ...current,
                        deliveryAddresses: current.deliveryAddresses.map((item, addressIndex) => {
                          if (addressIndex === index) return nextAddress;
                          return nextAddress.isDefault ? { ...item, isDefault: false } : item;
                        }),
                      }))
                    }
                    onRemove={() =>
                      setProfile((current) => {
                        const deliveryAddresses = current.deliveryAddresses.filter(
                          (_, addressIndex) => addressIndex !== index,
                        );
                        if (deliveryAddresses.length && !deliveryAddresses.some((item) => item.isDefault))
                          deliveryAddresses[0] = { ...deliveryAddresses[0], isDefault: true };
                        return { ...current, deliveryAddresses };
                      })
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="customer-profile-empty">
                <strong>Belum ada alamat pengiriman</strong>
                <p>Tambahkan bila lokasi pengiriman berbeda dari alamat penagihan.</p>
              </div>
            )}
          </section>

          <footer className="customer-profile-form__actions">
            <button aria-busy={pending} disabled={pending} type="submit">
              {pending ? "Menyimpan…" : initialProfile ? "Simpan perubahan" : "Simpan pelanggan"}
            </button>
          </footer>
        </form>
        {initialProfile?.id && canDelete && deleteAction ? (
          <form className="customer-profile-delete" onSubmit={removeCustomer}>
            <input name="id" type="hidden" value={initialProfile.id} />
            <input name="kind" type="hidden" value="customer" />
            <div>
              <strong>Hapus pelanggan</strong>
              <p>Hanya dapat dihapus jika belum dipakai pada transaksi atau file.</p>
              {deleteError ? (
                <p className="customer-profile-delete__error" role="alert">
                  {deleteError}
                </p>
              ) : null}
            </div>
            {confirmDelete ? (
              <div
                className="customer-profile-delete__confirm"
                role="group"
                aria-label={`Konfirmasi hapus ${initialProfile.name}`}
              >
                <p>
                  Yakin ingin menghapus <strong>{initialProfile.name}</strong>? Tindakan ini tidak dapat dibatalkan.
                </p>
                <button
                  className="admin-button admin-button--ghost"
                  onClick={() => setConfirmDelete(false)}
                  type="button"
                >
                  Batal
                </button>
                <button className="customer-profile-delete__button" disabled={pending} type="submit">
                  {pending ? "Menghapus…" : "Ya, hapus pelanggan"}
                </button>
              </div>
            ) : (
              <button className="customer-profile-delete__button" onClick={() => setConfirmDelete(true)} type="button">
                Hapus pelanggan
              </button>
            )}
          </form>
        ) : null}
      </AdminSheet>
    </>
  );
}
