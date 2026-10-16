import Link from "next/link";
import type { ReactNode } from "react";

type BackLink = {
  href: string;
  label: string;
};

type AdminPageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  back?: BackLink;
  actions?: ReactNode;
  titleAction?: ReactNode;
  className?: string;
  titleId?: string;
};

/** A restrained, shared header for every operational page in the admin workspace. */
export function AdminPageHeader({
  title,
  titleAction,
  description,
  back,
  actions,
  className,
  titleId,
}: AdminPageHeaderProps) {
  return (
    <header className={["admin-page-header", className].filter(Boolean).join(" ")} data-ui-surface="header">
      {back ? (
        <Link className="admin-page-header__back" href={back.href}>
          {back.label}
        </Link>
      ) : null}
      <div className="admin-page-header__copy">
        <div className="admin-page-header__title-row">
          <h1 id={titleId}>{title}</h1>
          {titleAction}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="admin-page-header__actions">{actions}</div> : null}
    </header>
  );
}
