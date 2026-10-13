"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";

type AsyncState = "idle" | "pending" | "success" | "error";
type ToastTone = "success" | "error" | "info";
type ToastInput = { title: string; message?: string; tone?: ToastTone; persistent?: boolean };
type ToastRecord = ToastInput & { id: string };

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

export function AdminToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const notify = useCallback((toast: ToastInput) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { ...toast, id }]);
    if (!toast.persistent && toast.tone !== "error") {
      window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4200);
    }
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="admin-toast-region" aria-atomic="false" aria-live="polite">
        {toasts.map((toast) => (
          <section className="admin-toast" data-tone={toast.tone ?? "info"} key={toast.id} role="status">
            <span className="admin-toast__icon" aria-hidden="true">
              {toast.tone === "error" ? (
                <svg viewBox="0 0 24 24">
                  <path d="M12 7v6M12 17h.01M4.93 19h14.14a2 2 0 0 0 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.2 16a2 2 0 0 0 1.73 3Z" />
                </svg>
              ) : toast.tone === "success" ? (
                <svg viewBox="0 0 24 24">
                  <path d="m7 12 3 3 7-7M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24">
                  <path d="M12 11v6M12 7h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
                </svg>
              )}
            </span>
            <span className="admin-toast__copy">
              <strong>{toast.title}</strong>
              {toast.message ? <span>{toast.message}</span> : null}
            </span>
            <button
              aria-label="Tutup pemberitahuan"
              onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </section>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useAdminToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("useAdminToast harus digunakan di dalam AdminToastProvider.");
  return notify;
}

type AdminActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  state?: AsyncState;
  pendingLabel?: string;
};

export const AdminActionButton = forwardRef<HTMLButtonElement, AdminActionButtonProps>(function AdminActionButton(
  { children, className, disabled, pendingLabel = "Memproses…", state = "idle", ...props },
  ref,
) {
  const pending = state === "pending";
  return (
    <button
      {...props}
      aria-busy={pending}
      className={["admin-action-button", className].filter(Boolean).join(" ")}
      disabled={disabled || pending}
      ref={ref}
    >
      {pending ? <span className="admin-spinner" aria-hidden="true" /> : null}
      <span>{pending ? pendingLabel : children}</span>
    </button>
  );
});

export function AdminMutationStatus({ state, children }: { state: AsyncState; children?: ReactNode }) {
  if (state === "idle" && !children) return null;
  return (
    <p className="admin-mutation-status" data-state={state} role={state === "error" ? "alert" : "status"}>
      {state === "pending" ? <span className="admin-spinner" aria-hidden="true" /> : null}
      {children}
    </p>
  );
}

export function AdminListRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={["admin-list-row", className].filter(Boolean).join(" ")} data-ui-surface="item" />;
}

export function AdminSectionHeader({
  eyebrow,
  title,
  description,
  action,
  titleId,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  titleId?: string;
  className?: string;
}) {
  return (
    <header className={["admin-section-header", className].filter(Boolean).join(" ")}>
      <div className="admin-section-header__meta">
        {eyebrow ? <p className="admin-section-header__eyebrow">{eyebrow}</p> : null}
        {action ? <div className="admin-section-header__action">{action}</div> : null}
      </div>
      <h2 id={titleId}>{title}</h2>
      {description ? <p className="admin-section-header__description">{description}</p> : null}
    </header>
  );
}

export function AdminEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="admin-empty-state" data-ui-surface="item">
      <span className="admin-empty-state__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M5 5h14v14H5zM8 9h8M8 13h5" />
        </svg>
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div>{action}</div> : null}
    </section>
  );
}

export function AdminChartCard({
  title,
  insight,
  value,
  detail,
  children,
}: {
  title: string;
  insight: string;
  value?: ReactNode;
  detail?: ReactNode;
  children: ReactNode;
}) {
  const descriptionId = useId();
  return (
    <section className="admin-chart-card" aria-describedby={descriptionId} data-ui-surface="item">
      <header>
        <span>
          <p>{insight}</p>
          <h2>{title}</h2>
        </span>
        {value ? <strong>{value}</strong> : null}
      </header>
      <p className="admin-sr-only" id={descriptionId}>
        {insight}
      </p>
      <div className="admin-chart-card__plot">{children}</div>
      {detail ? (
        <details className="admin-chart-card__data">
          <summary>Lihat data</summary>
          {detail}
        </details>
      ) : null}
    </section>
  );
}

export function AdminSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="admin-sheet__overlay" />
        <Dialog.Content className="admin-sheet">
          <span className="admin-sheet__handle" aria-hidden="true" />
          <header className="admin-sheet__header">
            <span>
              <Dialog.Title>{title}</Dialog.Title>
              {description ? <Dialog.Description>{description}</Dialog.Description> : null}
            </span>
            <Dialog.Close aria-label="Tutup panel" className="admin-sheet__close">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </Dialog.Close>
          </header>
          <div className="admin-sheet__body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function AdminBackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="admin-back-link" href={href}>
      {children}
    </Link>
  );
}

export type { AsyncState };
