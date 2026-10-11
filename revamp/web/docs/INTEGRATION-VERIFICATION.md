# Local integration verification — 4 October 2026

## Scope and safety

Transactions, Email CS and quotation/invoice/delivery/STB integration; no real customer message, paid DocGen render, official activation, push or deployment. Existing unrelated local changes are preserved. No new schema migration was required.

Before data work, a PostgreSQL backup was created at `storage/backups/visitor-report-2026-10-04T02-36-14-355Z.dump` (246893 bytes). Keep the integration encryption key separately; it is needed to recover encrypted archives.

## Fixes

- Document email now uses the shared draft → immutable preview → confirmation pipeline rather than the former direct-send action. Legacy direct calls are refused.
- Customer recipient, current quotation/item details, invoice snapshot/amount/status, latest shipment document, version, checksum, private file and release policy are rechecked before send claim.
- Document delivery and draft revisions are locked atomically. Pending/uncertain sends stay blocked; simulation or known pre-acceptance failure does not mark the document sent.
- Copying a draft preserves its private files and source/template metadata atomically.
- Document archives and Email CS link to each other. Simulation has an explicit status in both locations, including mobile details.
- Closure and receipt comparisons use integer decimal units. Partial receipts with missing accepted quantities no longer silently count as complete; historical fully received rows retain their prior meaning. Received-partial shipments remain eligible for appropriate invoice processing.
- Mail refresh preserves list filters. Normal subject letters are not misidentified as header injection; CR/LF is still refused.

## Evidence

- Automated tests cover source tampering, stale snapshots, mandatory PDF, restricted recipients, cancelled invoice, STB refusal, copy/file integrity, duplicate confirmation and post-SMTP database failure. Transport is mocked, not connected to SMTP.
- Local fixture benchmark: 1000 transactions, 25-row grouped listing; observed p95 approximately 15 ms. Email listing fixture: 10000 records; p95 approximately 31 ms. These are local measurements, not production guarantees.
- Browser simulation on the pre-existing `[UJI]` transaction completed without sending. Draft `b277cbad-4837-452e-9df3-8c1517df23d6`, outbox `a71018de-d74f-455f-8b55-6cb76c4037fb`; mandatory delivery PDF remained downloadable via the authenticated archive route. QA records are retained for inspection.
- Four local, credit-free document renders reviewed. Long-table fixtures for each document rendered two pages, with repeated table headings, totals and signature areas inspected. No historical PDF was overwritten.
- Verification commands: 103 tests total, 102 passed, zero failures; the optional Google Ads database test was skipped. Typecheck, lint, format check and production build passed. Node 20 emits its existing experimental JSON-module warning during build.
- Actual Chrome screenshots inspected for transaction detail and Email CS in light/dark, including mobile 375×812, desktop 1440 and email tablet/lanscape breakpoints 768/980/1024/812×375. No horizontal document overflow was measured in the checked views. This is targeted integration QA, not a claim that every transaction form and every role has completed the full visual acceptance matrix.

## Release acceptance still required

Real SMTP/IMAP reconnect and delivery outcomes need separate test-mailbox approval. This change does not prove customer inbox delivery, enable official templates, or constitute production approval. Browser checks on local Chrome are not equivalent to physical iOS/Safari testing. Never describe this as a zero-bug guarantee.

The automated Chrome Back/Forward probe restored the unsaved editor content via history, but did not expose a confirmation dialog. Do not mark the cross-browser navigation-warning acceptance complete on that evidence alone; verify native Back, reload and tab close on a real interactive browser before release.

That probe exposed a suspended save flag after history restoration. The editor now resets its in-flight flags on persisted `pageshow`, invalidates the preview and pauses autosave until explicit save/copy. Retesting restored the unsaved subject and successfully saved revision 5 without losing content.
