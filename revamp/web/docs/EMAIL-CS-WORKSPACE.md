# Email CS workspace

## Local safety

The workspace defaults to `EMAIL_CS_SEND_MODE=simulate`. This records a local simulation, not a sent email. Production sends are blocked unless the server explicitly enables `live`. Enabling live delivery is a separate release decision, not part of installing this change. Non-production live delivery is restricted to all recipients in `EMAIL_CS_TEST_RECIPIENTS`, including CC/BCC. Never commit private test addresses or credentials.

Drafts, files, final snapshots and SMTP recipient outcomes are encrypted using the existing integration encryption key. Back up that key independently of the database. Draft access is limited to its owner and administrators. No message content is persisted in browser local storage.

## Send lifecycle

Save the draft, prepare a server-owned snapshot, inspect recipients and attachments, then confirm. A changed draft invalidates its previous preview. Preview expiry is ten minutes. Database revision checks reject simultaneous edits without overwriting the editor's current content.

`sent` means the SMTP server accepted the message, not that the recipient received or read it. `partial` records accepted/rejected addresses separately. Only explicitly rejected recipients may be prepared in a new draft; the user must inspect and confirm it again. `uncertain` and a stuck `pending` must not be retried automatically. Check the provider's sent folder/logs before deciding whether another message is appropriate. A database failure after SMTP acceptance leaves the attempt blocked rather than making it retryable.

PDF/JPG/PNG/WebP files are private, validated and checksummed. The limit is five attachments and 10 MB including inline template images. Known transaction PDF checksums are rejected by the generic uploader: document delivery must use the guarded Transaksi action. Existing official-document and example-recipient gates are unchanged.

The Transaksi action now prepares a private Email CS draft, not a direct send. Its server-owned document reference freezes the version and checksum. The final preview includes the mandatory PDF; recipient/customer, quotation currency, invoice snapshot, current shipment, private bytes and document permissions are checked again under the transaction lock before claiming delivery. Contract and STB email delivery are refused. A simulated attempt is linked back to the transaction but does not mark the PDF as sent.

## Migration and verification

Migrations 0031/0032 add workspace fields/tables/indexes and widen the outbox To field. Existing mail archives are not rewritten. Take a recoverable database backup before applying migrations.

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm build`. The email workspace test uses the local database in an outer rollback transaction, a mocked mail transport, and a 10,000-message fixture. It does not connect to SMTP or retain fixture rows. Local UI QA drafts are explicitly marked `[UJI LOKAL]` and are not customer messages.

The concurrency test uses two independent database connections and a mocked transport. Its committed fixtures are removed by their exact generated IDs, including audit/outbox rows. It proves one transport call for concurrent confirmation and blocked retry after a post-acceptance database failure. Run this only against the configured local database.

## Outstanding acceptance

Live SMTP/IMAP failure and reconnect tests require a separately approved test mailbox. Production delivery is not enabled by this document. Cross-tab conflict/copy recovery and local simulation have been exercised in the browser. Rollback tests cover corrupt/oversized PDF files, valid JPG/PNG/WebP, rejected SVG, attachment counts, removal and archived private bytes. Real mailbox reconnect/failure acceptance and full final accessibility review remain required before release. Keep the shared DocGen send workflow under its existing restrictions; this workspace does not replace its release approval.
