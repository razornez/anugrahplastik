const hostPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type RemoteDesktopConfiguration =
  { status: "not_configured" } | { status: "configured"; host: string; port: number };

export function getRemoteDesktopConfiguration(): RemoteDesktopConfiguration {
  const host = process.env.REMOTE_DESKTOP_TAILSCALE_HOST?.trim().toLowerCase();
  const port = Number(process.env.REMOTE_DESKTOP_TAILSCALE_PORT ?? "3389");
  if (!host || !hostPattern.test(host) || !Number.isInteger(port) || port !== 3389) return { status: "not_configured" };
  return { status: "configured", host, port };
}

export function createRemoteDesktopProfile(
  configuration: Extract<RemoteDesktopConfiguration, { status: "configured" }>,
) {
  return [
    `full address:s:${configuration.host}:${configuration.port}`,
    "prompt for credentials:i:1",
    "authentication level:i:2",
    "enablecredsspsupport:i:1",
    "screen mode id:i:2",
    "redirectprinters:i:1",
    "redirectclipboard:i:1",
    "redirectdrives:i:0",
    "redirectcomports:i:0",
    "redirectsmartcards:i:0",
    "redirectwebauthn:i:0",
    "audiomode:i:0",
    "disable wallpaper:i:1",
  ].join("\r\n");
}
