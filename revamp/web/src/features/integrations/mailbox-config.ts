import "server-only";

const DEFAULT_MAIL_HOST = "mail.anugrahplastik.com";
const DEFAULT_IMAP_PORT = 993;
const DEFAULT_SMTP_PORT = 465;

function validHost(value: string) {
  return /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i.test(value) && !value.includes("..");
}

function configuredPort(value: string | undefined, fallback: number) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65_536 ? port : fallback;
}

/**
 * Mail transport is server configuration, never browser input. This lets the
 * application follow a cPanel provider hostname without exposing operations
 * details to the owner or trusting a tampered form.
 */
export function getCsMailboxServerConfig() {
  const candidate = process.env.CS_MAIL_HOST?.trim();
  return {
    host: candidate && validHost(candidate) ? candidate.toLowerCase() : DEFAULT_MAIL_HOST,
    imapPort: configuredPort(process.env.CS_MAIL_IMAP_PORT, DEFAULT_IMAP_PORT),
    smtpPort: configuredPort(process.env.CS_MAIL_SMTP_PORT, DEFAULT_SMTP_PORT),
    configuredExplicitly: Boolean(candidate && validHost(candidate)),
  };
}
