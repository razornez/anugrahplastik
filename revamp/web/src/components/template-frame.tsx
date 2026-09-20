"use client";

import { useState } from "react";

export function TemplateFrame() {
  const [height, setHeight] = useState(7200);

  return (
    <iframe
      className="template-frame"
      src="/template-light/index.html"
      title="Anugrah Plastik"
      style={{ height }}
      onLoad={(event) => {
        const documentHeight = event.currentTarget.contentDocument?.documentElement.scrollHeight;

        if (documentHeight) {
          setHeight(documentHeight);
        }
      }}
    />
  );
}
