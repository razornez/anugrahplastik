"use client";
/* eslint-disable @next/next/no-img-element -- private authenticated image route cannot use the public optimizer. */

import { useState } from "react";
import { AdminShimmer } from "@/components/admin-shimmer";

export function DesignListThumbnail({
  fileId,
  format,
  hasThumbnail,
  title,
}: {
  fileId: string;
  format: string;
  hasThumbnail: boolean;
  title: string;
}) {
  const [loaded, setLoaded] = useState(false);
  if (!hasThumbnail)
    return (
      <span className="design-row-preview design-row-preview--format" aria-hidden="true">
        {format.toUpperCase()}
      </span>
    );
  return (
    <span className={`design-row-preview design-row-preview--image${loaded ? " is-loaded" : ""}`} aria-hidden="true">
      {!loaded ? <AdminShimmer /> : null}
      <img
        src={`/api/admin/design-files/${fileId}/thumbnail`}
        alt=""
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        title={`Preview ${title}`}
      />
    </span>
  );
}
