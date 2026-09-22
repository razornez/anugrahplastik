import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#0b2442",
        color: "white",
        display: "flex",
        fontSize: 180,
        fontWeight: 800,
        height: "100%",
        justifyContent: "center",
        letterSpacing: -18,
        width: "100%",
      }}
    >
      AP
    </div>,
    { ...size },
  );
}
