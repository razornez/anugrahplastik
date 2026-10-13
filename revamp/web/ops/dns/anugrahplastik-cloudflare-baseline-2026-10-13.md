# Anugrah Plastik Cloudflare migration baseline

Captured on 2026-10-13 before changing the registrar delegation.

## Delegation and origin

- Previous nameservers: `ns1.niagahoster.com`, `ns2.niagahoster.com`
- Cloudflare nameservers: `princess.ns.cloudflare.com`, `reese.ns.cloudflare.com`
- Origin IPv4: `145.79.11.161`
- Origin HTTPS certificate: Let's Encrypt for `anugrahplastik.com` and
  `www.anugrahplastik.com`, valid through 2027-01-09
- Nginx rollback checkpoint:
  `/root/anugrahplastik-release-checkpoints/cloudflare-migration-20261013T0125Z`

## Imported DNS records

All records were imported as DNS-only. Only the apex and `www` may be proxied
after Cloudflare reports the zone as active.

| Type  | Name                      | Value                                                                                                                                                                                                             | Priority |
| ----- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| A     | `@`                       | `145.79.11.161`                                                                                                                                                                                                   |          |
| A     | `autoconfig`              | `45.143.81.214`                                                                                                                                                                                                   |          |
| A     | `autodiscover`            | `45.143.81.214`                                                                                                                                                                                                   |          |
| A     | `blog`                    | `45.143.81.214`                                                                                                                                                                                                   |          |
| A     | `cpanel`                  | `45.143.81.214`                                                                                                                                                                                                   |          |
| A     | `cpcalendars`             | `45.143.81.214`                                                                                                                                                                                                   |          |
| A     | `cpcontacts`              | `45.143.81.214`                                                                                                                                                                                                   |          |
| A     | `ftp`                     | `156.67.209.99`                                                                                                                                                                                                   |          |
| A     | `mail`                    | `45.143.81.214`                                                                                                                                                                                                   |          |
| A     | `webdisk`                 | `45.143.81.214`                                                                                                                                                                                                   |          |
| A     | `webmail`                 | `45.143.81.214`                                                                                                                                                                                                   |          |
| A     | `whm`                     | `45.143.81.214`                                                                                                                                                                                                   |          |
| A     | `www.blog`                | `45.143.81.214`                                                                                                                                                                                                   |          |
| CNAME | `www`                     | `anugrahplastik.com`                                                                                                                                                                                              |          |
| MX    | `@`                       | `mail.anugrahplastik.com`                                                                                                                                                                                         | `0`      |
| SRV   | `_autodiscover._tcp`      | `0 0 443 cpanelemaildiscovery.cpanel.net`                                                                                                                                                                         |          |
| SRV   | `_caldavs._tcp`           | `0 0 2080 anugrahplastik.com`                                                                                                                                                                                     |          |
| SRV   | `_caldav._tcp`            | `0 0 2079 anugrahplastik.com`                                                                                                                                                                                     |          |
| SRV   | `_carddavs._tcp`          | `0 0 2080 anugrahplastik.com`                                                                                                                                                                                     |          |
| SRV   | `_carddav._tcp`           | `0 0 2079 anugrahplastik.com`                                                                                                                                                                                     |          |
| TXT   | `_acme-challenge`         | `ytSvvjOwInGkiTi7tXILQF9FtYf6i8bVZVE3qcCGnmw`                                                                                                                                                                     |          |
| TXT   | `@`                       | `v=spf1 ip4:45.143.81.201 include:relay.mailchannels.net ip4:5.181.216.1 ip4:156.67.209.1 include:spf.antispamcloud.com +a +mx +ip4:156.67.212.251 +ip4:156.67.209.13 +ip4:202.150.213.2 +ip4:202.150.213.3 ~all` |          |
| TXT   | `_caldavs._tcp`           | `path=/`                                                                                                                                                                                                          |          |
| TXT   | `_caldav._tcp`            | `path=/`                                                                                                                                                                                                          |          |
| TXT   | `_carddavs._tcp`          | `path=/`                                                                                                                                                                                                          |          |
| TXT   | `_carddav._tcp`           | `path=/`                                                                                                                                                                                                          |          |
| TXT   | `_cpanel-dcv-test-record` | `_cpanel-dcv-test-record=SP0964JAyVJpS82FxRTyIJ0cc2L2R7AddWwHviOUMK3_E0Xpz79IQuOMZfwFFuyn`                                                                                                                        |          |
| TXT   | `default._domainkey`      | Existing 2048-bit DKIM public key copied byte-for-byte from the previous authoritative DNS                                                                                                                        |          |

No DMARC, Google site verification, AAAA, CAA, or DS record existed in the
authoritative baseline. Do not synthesize those records during rollback.

## Cloudflare settings

- Plan: Free
- SSL/TLS mode: Full (strict)
- TLS 1.3: enabled
- WebSockets: enabled
- Always Use HTTPS: enabled after origin HTTPS validation
- Bot Preference Sync: disabled
- Web Analytics: not enabled
- Email and administrative hostnames: DNS-only
