/* eslint-disable @typescript-eslint/no-require-imports -- Compile pure TypeScript fixtures without a build. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { resolve } = require("node:path");
const { dirname } = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const filename = resolve(__dirname, "../src/features/integrations/email-workspace-model.ts");
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded._compile(
  ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  filename,
);
const { parseRecipients, mailThreadKey, replyRecipients, safelyFailedBeforeAcceptance, outgoingStatusLabel } =
  loaded.exports;

test("Email tabs do not retain the legacy duplicate compose action or its conflicting styles", () => {
  for (const file of [
    "src/app/admin/email/page.tsx",
    "src/app/admin/email/email-workspace.css",
    "src/app/globals.css",
  ]) {
    assert.doesNotMatch(readFileSync(resolve(__dirname, "..", file), "utf8"), /email-compose-link/);
  }
  assert.match(
    readFileSync(resolve(__dirname, "../src/app/admin/email/page.tsx"), "utf8"),
    /className="admin-primary-button"/,
  );
});

test("Email details use a right desktop panel and keyboard-dismissible bottom drawer only on mobile", () => {
  const page = readFileSync(resolve(__dirname, "../src/app/admin/email/page.tsx"), "utf8");
  const drawer = readFileSync(resolve(__dirname, "../src/components/email-detail-drawer.tsx"), "utf8");
  const styles = readFileSync(resolve(__dirname, "../src/app/admin/email/email-workspace.css"), "utf8");
  assert.match(page, /EmailDetailDrawer/);
  assert.match(page, /label="Detail draf email"/);
  assert.match(page, /label=\{params\.compose \? "Tulis email" : "Detail email"\}/);
  assert.match(drawer, /window\.matchMedia\("\(max-width: 767px\)"\)/);
  assert.match(drawer, /dialog\.showModal\(\)/);
  assert.match(drawer, /dialog\.show\(\)/);
  assert.match(drawer, /addEventListener\("cancel"/);
  assert.match(drawer, /Tutup detail email/);
  assert.match(styles, /\.email-detail-drawer::backdrop/);
  assert.match(styles, /@media \(min-width: 768px\)/);
  assert.match(
    styles,
    /\.email-workspace--detail \{[\s\S]*grid-template-columns: minmax\(260px, 35%\) minmax\(0, 1fr\)/,
  );
  assert.match(styles, /prefers-reduced-motion/);
});

test("Selecting an inbox item keeps the current list scroll position", () => {
  const navigation = readFileSync(resolve(__dirname, "../src/components/email-list-navigation.tsx"), "utf8");
  assert.match(navigation, /scroll=\{false\}/);
  assert.match(navigation, /sessionStorage\.setItem\(storageKey/);
  assert.match(navigation, /onClick\?\.\(event\)/);
});

test("Email CS uses stable, accessible shimmer placeholders while content is loading", () => {
  const shimmer = readFileSync(resolve(__dirname, "../src/components/admin-shimmer.tsx"), "utf8");
  const loading = readFileSync(resolve(__dirname, "../src/components/email-loading-shimmer.tsx"), "utf8");
  const selection = readFileSync(resolve(__dirname, "../src/components/email-selection-loading.tsx"), "utf8");
  const page = readFileSync(resolve(__dirname, "../src/app/admin/email/page.tsx"), "utf8");
  const routeLoading = readFileSync(resolve(__dirname, "../src/app/admin/email/loading.tsx"), "utf8");
  const composer = readFileSync(resolve(__dirname, "../src/components/email-draft-composer.tsx"), "utf8");
  const design = readFileSync(resolve(__dirname, "../src/app/admin/admin-design.css"), "utf8");
  const styles = readFileSync(resolve(__dirname, "../src/app/admin/email/email-workspace.css"), "utf8");

  assert.match(shimmer, /aria-hidden="true"/);
  assert.match(shimmer, /admin-shimmer/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /role="status"/);
  assert.match(selection, /emailSelectionLoadingEvent/);
  assert.match(selection, /useSearchParams/);
  assert.match(page, /EmailSelectionLoading/);
  assert.match(page, /fallback=\{<EmailDetailShimmer label="Memuat isi email" \/>\}/);
  assert.match(routeLoading, /EmailDetailShimmer/);
  assert.match(composer, /loading: \(\) => <EmailEditorShimmer \/>/);
  assert.match(design, /--admin-shimmer-base/);
  assert.match(design, /@keyframes admin-shimmer/);
  assert.match(design, /prefers-reduced-motion/);
  assert.match(styles, /\.email-selection-loading/);
});

test("External images keep a compact, accessible privacy control above HTML email", () => {
  const preview = readFileSync(resolve(__dirname, "../src/components/integrations/email-html-preview.tsx"), "utf8");
  const styles = readFileSync(resolve(__dirname, "../src/app/globals.css"), "utf8");
  const mobileStyles = readFileSync(resolve(__dirname, "../src/app/admin/email/email-workspace.css"), "utf8");
  assert.match(preview, /Gambar luar diblokir/);
  assert.match(preview, /aria-pressed=\{allowRemoteImages\}/);
  assert.match(preview, /Muat gambar/);
  assert.match(preview, /Blokir lagi/);
  assert.match(preview, /aria-describedby=\{privacyNoticeId\}/);
  assert.match(preview, /sandbox="allow-same-origin"/);
  assert.match(preview, /ResizeObserver/);
  assert.match(preview, /Math\.min\(Math\.max\(contentHeight \+ 2, 300\), 960\)/);
  assert.match(styles, /\.email-html-preview__privacy-state/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /text-overflow: ellipsis/);
  assert.match(mobileStyles, /min-height: clamp\(320px, 62dvh, 560px\)/);
});

test("HTML email previews constrain desktop sender markup to the drawer viewport", () => {
  const source = readFileSync(resolve(__dirname, "../src/features/integrations/email-preview-document.ts"), "utf8");
  assert.match(source, /overflow-x: hidden/);
  assert.match(source, /body table \{ width: 100% !important/);
  assert.match(source, /max-width: 100% !important/);
  assert.match(source, /body h1 \{ font-size: 19px !important/);
  assert.match(source, /font: 13px\/1\.45 Arial/);
});

test("Composer accepts multiple attachments without discarding all but the first selected file", () => {
  const source = readFileSync(resolve(__dirname, "../src/components/email-draft-composer.tsx"), "utf8");
  const ast = ts.createSourceFile("composer.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let fileInput;
  function visit(node) {
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(ast) === "input" &&
      node.attributes.properties.some(
        (property) =>
          ts.isJsxAttribute(property) && property.name.getText(ast) === "type" && property.initializer?.text === "file",
      )
    )
      fileInput = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(fileInput, "Attachment picker exists");
  assert.ok(fileInput.attributes.properties.some((property) => property.name?.getText(ast) === "multiple"));
  assert.match(fileInput.getText(ast), /Array\.from\(event\.target\.files/);
  assert.doesNotMatch(fileInput.getText(ast), /files\?\.\[0\]/);
  assert.match(source, /for \(const file of selected\)/);
  assert.match(source, /revisionRef\.current = result\.revision/);
});

test("Recipient validation includes CC/BCC, accepts separators, rejects duplicates and header injection", () => {
  assert.deepEqual(parseRecipients({ to: "a@example.com; b@example.com", cc: "c@example.com", bcc: "d@example.com" }), {
    to: ["a@example.com", "b@example.com"],
    cc: ["c@example.com"],
    bcc: ["d@example.com"],
  });
  assert.throws(() => parseRecipients({ to: "A@example.com", bcc: "a@example.com" }), /berulang/);
  assert.throws(() => parseRecipients({ to: "a@example.com\r\nBcc: victim@example.com" }), /valid/);
  assert.throws(() => parseRecipients({ to: "not-email" }), /valid/);
  assert.throws(() => parseRecipients({ to: "" }), /minimal/);
  assert.deepEqual(parseRecipients({ to: "" }, false), { to: [], cc: [], bcc: [] });
});
test("The recipient limit covers all three fields", () => {
  const addresses = Array.from({ length: 10 }, (_, i) => `user${i}@example.com`).join(",");
  assert.equal(parseRecipients({ to: addresses }).to.length, 10);
  assert.throws(() => parseRecipients({ to: addresses, cc: "extra@example.com" }), /10/);
});
test("Threads use reference IDs, never subject similarity", () => {
  assert.equal(
    mailThreadKey("<child@example.com>", "<parent@example.com>", "<root@example.com> <parent@example.com>"),
    "<root@example.com>",
  );
  assert.equal(mailThreadKey("<child@example.com>", "<parent@example.com>"), "<parent@example.com>");
  assert.equal(mailThreadKey("<self@example.com>", null), "<self@example.com>");
  assert.equal(mailThreadKey("same subject", "bad id", null), null);
});
test("Reply-all honors Reply-To, excludes own address and never invents BCC", () => {
  assert.deepEqual(
    replyRecipients(
      "sender@example.com",
      "reply@example.com",
      "own@example.com, colleague@example.com",
      "colleague@example.com,other@example.com",
      "own@example.com",
      true,
    ),
    {
      to: "reply@example.com",
      cc: "colleague@example.com, other@example.com",
      bcc: "",
    },
  );
  assert.deepEqual(replyRecipients("sender@example.com", null, "other@example.com", null, "own@example.com", false), {
    to: "sender@example.com",
    cc: "",
    bcc: "",
  });
});
test("Only failures proven before SMTP acceptance are retryable", () => {
  for (const code of ["EAUTH", "EDNS", "ECONNECTION"]) assert.equal(safelyFailedBeforeAcceptance({ code }), true);
  assert.equal(safelyFailedBeforeAcceptance({ command: "RCPT TO", responseCode: 550 }), true);
  for (const error of [
    { command: "DATA", responseCode: 451 },
    { code: "ETIMEDOUT" },
    new Error("DB persistence failed"),
    null,
  ]) {
    assert.equal(safelyFailedBeforeAcceptance(error), false);
  }
  assert.equal(outgoingStatusLabel("sent"), "Diterima server email");
  assert.equal(outgoingStatusLabel("uncertain"), "Status belum pasti");
});

test("Local database: draft ownership, revisions, frozen preview, SMTP outcomes and 10k metadata benchmark", async (context) => {
  require("dotenv").config({ path: resolve(__dirname, "../.env.local"), quiet: true });
  if (
    !process.env.DATABASE_URL ||
    !["localhost", "127.0.0.1", "::1"].includes(new URL(process.env.DATABASE_URL).hostname)
  )
    return context.skip("Local database required");
  const { Pool } = require("pg");
  const { drizzle } = require("drizzle-orm/node-postgres");
  const { sql } = require("drizzle-orm");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const db = drizzle(pool);
  const prior = {
    mode: process.env.EMAIL_CS_SEND_MODE,
    recipients: process.env.EMAIL_CS_TEST_RECIPIENTS,
    node: process.env.NODE_ENV,
  };
  process.env.NODE_ENV = "development";
  process.env.EMAIL_CS_SEND_MODE = "live";
  process.env.EMAIL_CS_TEST_RECIPIENTS = "qa@example.invalid,copy@example.invalid";
  const rollback = new Error("ROLLBACK_FIXTURES");
  function compile(path, stubs, cache = new Map()) {
    if (cache.has(path)) return cache.get(path);
    const item = new Module(path, module);
    item.filename = path;
    item.paths = module.paths;
    cache.set(path, item.exports);
    item.require = (id) =>
      stubs[id] ??
      (id.startsWith("@/")
        ? compile(resolve(__dirname, "../src", `${id.slice(2)}.ts`), stubs, cache)
        : id.startsWith(".")
          ? compile(resolve(dirname(path), `${id}.ts`), stubs, cache)
          : require(id));
    item._compile(
      ts.transpileModule(readFileSync(path, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      }).outputText,
      path,
    );
    cache.set(path, item.exports);
    return item.exports;
  }
  try {
    await assert.rejects(
      db.transaction(async (tx) => {
        const result = await tx.execute(sql`select id,name from users order by created_at limit 1`);
        if (!result.rows.length) throw new Error("Local fixture owner required");
        const owner = result.rows[0];
        let actor = { ...owner, role: "sales" };
        let calls = 0;
        let outcome = "sent";
        let envelope;
        const content = {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "TEST ONLY" }] }],
        };
        const stubs = {
          "server-only": {},
          "@/lib/database/client": { getDatabase: () => tx },
          "@/lib/auth/session": { getSession: async () => actor },
          "./mail-service": {
            getMailboxSettings: async () => ({
              email: "sender@example.invalid",
              host: "never-connect.invalid",
              smtpPort: 465,
              password: "fixture",
            }),
            getEmailRecord: async () => null,
          },
          "./email-templates": {
            getActiveTemplate: async () => ({ content, version: 1 }),
            validateEmailDoc: (value) => value,
            buildTemplatedEmail: async () => ({ html: "<p>TEST ONLY</p>", text: "TEST ONLY", attachments: [] }),
          },
          "./secrets": {
            encryptSecret: (value) => Buffer.from(JSON.stringify(value)).toString("base64"),
            decryptSecret: (value) => JSON.parse(Buffer.from(value, "base64").toString()),
          },
          nodemailer: {
            createTransport: () => ({
              close() {},
              async sendMail(value) {
                calls++;
                envelope = value;
                if (outcome === "auth") throw { code: "EAUTH" };
                if (outcome === "uncertain") throw { code: "ETIMEDOUT", command: "DATA" };
                return {
                  messageId: value.messageId,
                  accepted: ["qa@example.invalid"],
                  rejected: outcome === "partial" ? ["copy@example.invalid"] : [],
                };
              },
            }),
          },
        };
        const workspace = compile(resolve(__dirname, "../src/features/integrations/email-drafts.ts"), stubs);
        const payload = {
          to: "qa@example.invalid",
          cc: "",
          bcc: "",
          subject: "TEST ONLY",
          content,
          originalSubject: "",
        };
        const draft = await workspace.createDraft(payload, 1);
        actor = { ...owner, id: "00000000-0000-4000-8000-000000000099", role: "sales" };
        await assert.rejects(workspace.readDraft(draft.id), /akses ditolak/, "foreign owner must be rejected");
        actor = { ...owner, role: "content" };
        await assert.rejects(workspace.readDraft(draft.id), /ditolak/, "content role must be rejected");
        actor = { ...owner, role: "sales" };
        const saved = await workspace.saveDraft(draft.id, 1, payload);
        assert.equal(saved.revision, 2);
        await assert.rejects(workspace.saveDraft(draft.id, 1, payload), /tab lain/, "stale revision must be rejected");
        const preview = await workspace.prepareDraft(draft.id, 2);
        assert.equal(preview.text, "TEST ONLY");
        await workspace.saveDraft(draft.id, 2, { ...payload, subject: "CHANGED" });
        await assert.rejects(
          workspace.sendPreparedDraft(preview.attemptId),
          /berubah/,
          "changed draft preview must be rejected",
        );
        const frozen = await workspace.prepareDraft(draft.id, 3);
        assert.equal((await workspace.sendPreparedDraft(frozen.attemptId)).status, "sent");
        assert.equal(envelope.subject, "CHANGED");
        assert.equal(envelope.text, frozen.text);
        assert.equal(calls, 1);
        await assert.rejects(workspace.sendPreparedDraft(frozen.attemptId), "a completed attempt must not send twice");
        assert.equal(calls, 1);
        for (const [failure, expected] of [
          ["partial", "partial"],
          ["auth", "failed"],
          ["uncertain", "uncertain"],
        ]) {
          outcome = failure;
          const another = await workspace.createDraft(
            { ...payload, cc: failure === "partial" ? "copy@example.invalid" : "" },
            1,
          );
          const checked = await workspace.prepareDraft(another.id, 1);
          assert.equal((await workspace.sendPreparedDraft(checked.attemptId)).status, expected);
          if (expected === "partial") {
            const retry = await workspace.retryRejectedRecipients(checked.attemptId);
            assert.equal(retry.payload.to, "");
            assert.equal(retry.payload.cc, "copy@example.invalid");
            assert(!JSON.stringify(retry.payload).includes("qa@example.invalid"));
          }
          if (expected !== "failed")
            await assert.rejects(
              workspace.saveDraft(another.id, 1, payload),
              /diproses/,
              `${expected} delivery must keep its draft immutable`,
            );
        }
        const conversations = compile(resolve(__dirname, "../src/features/integrations/email-conversations.ts"), stubs);
        let imapConnections = 0;
        let changedValidity = false;
        const mime = Buffer.from(
          "From: fixture@example.invalid\r\nTo: sender@example.invalid\r\nSubject: TEST ONLY\r\n\r\nCached fixture",
        );
        class FakeImap {
          async connect() {
            imapConnections++;
          }
          async logout() {}
          async list() {
            return [{ path: "INBOX" }, { path: "Sent", specialUse: "\\Sent" }];
          }
          async getMailboxLock(path) {
            this.path = path;
            this.mailbox = {
              uidValidity: changedValidity ? "CHANGED" : path === "INBOX" ? "FIXTURE-INBOX" : "FIXTURE-SENT",
            };
            return { release() {} };
          }
          async search() {
            return [1];
          }
          async *fetch() {
            yield {
              uid: 1,
              size: mime.length,
              internalDate: new Date(),
              envelope: {
                from: [{ address: "fixture@example.invalid" }],
                to: [{ address: "sender@example.invalid" }],
                subject: "TEST ONLY IMAP",
                messageId: `<fixture-${this.path}@example.invalid>`,
              },
              headers: Buffer.from("Reply-To: reply@example.invalid\r\nCc: copy@example.invalid\r\n\r\n"),
            };
          }
          async download() {
            return { content: require("node:stream").Readable.from([mime]) };
          }
        }
        const settings = {
          email: "sender@example.invalid",
          host: "never-connect.invalid",
          smtpPort: 465,
          imapPort: 993,
          password: "fixture",
        };
        await tx.execute(
          sql`insert into integrations(key,secret_ciphertext,metadata) values ('cs-mail',${stubs["./secrets"].encryptSecret(settings)},${JSON.stringify({ keep: "fixture" })}::jsonb) on conflict(key) do update set secret_ciphertext=excluded.secret_ciphertext, metadata=excluded.metadata`,
        );
        const mailbox = compile(resolve(__dirname, "../src/features/integrations/mail-service.ts"), {
          ...stubs,
          imapflow: { ImapFlow: FakeImap },
        });
        assert.equal((await mailbox.syncMailbox()).synced, 2);
        const cursors = (await tx.execute(sql`select metadata from integrations where key='cs-mail'`)).rows[0].metadata;
        assert.equal(cursors.keep, "fixture");
        assert.equal(cursors.mailboxCursors.inbox.lastUid, 1);
        assert.equal(cursors.mailboxCursors.sent.lastUid, 1);
        assert.equal((await mailbox.syncMailbox()).synced, 0);
        changedValidity = true;
        await assert.rejects(mailbox.fetchEmailBody("inbox", 1, "FIXTURE-INBOX"), /berubah/);
        changedValidity = false;
        assert.deepEqual(await mailbox.fetchEmailBody("inbox", 1, "FIXTURE-INBOX"), mime);
        const connected = imapConnections;
        assert.deepEqual(await mailbox.fetchEmailBody("inbox", 1, "FIXTURE-INBOX"), mime);
        assert.equal(imapConnections, connected, "cached body must not reconnect to IMAP");
        await tx.execute(
          sql`insert into cs_emails(folder,uid_validity,uid,size,subject,from_address,message_id,thread_key,received_at) select 'inbox','TEST-EMAIL-THREAD',g,0,'TEST THREAD '||g,'fixture@example.invalid','<thread-'||g||'@example.invalid>','<thread-root@example.invalid>',now()-g*interval '1 second' from generate_series(1,45) g`,
        );
        const threadList = await conversations.listConversations("inbox", undefined, "TEST THREAD");
        assert.equal(threadList.items.length, 1);
        assert.equal(threadList.items[0].count, 45);
        const latestMessages = await conversations.conversationMessages(threadList.items[0].id);
        assert.equal(latestMessages.items.length, 20);
        assert.equal(latestMessages.hasMore, true);
        const previousMessages = await conversations.conversationMessages(threadList.items[0].id, latestMessages.next);
        assert.equal(previousMessages.items.length, 20);
        assert(!previousMessages.items.some((row) => latestMessages.items.some((other) => row.id === other.id)));
        const { PDFDocument } = require("pdf-lib");
        const sharp = require("sharp");
        let imageDraft = await workspace.createDraft(payload, 1);
        imageDraft = await workspace.uploadDraftFile(
          imageDraft.id,
          1,
          "attachment.svg",
          Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2"/></svg>',
          ),
        );
        assert.equal(
          imageDraft.files.find((file) => file.filename === "attachment.svg").contentType,
          "application/octet-stream",
          "unknown formats remain download-only attachments and rely on malware scanning",
        );
        for (const format of ["jpeg", "png", "webp"]) {
          const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#7744aa" } })
            .toFormat(format)
            .toBuffer();
          imageDraft = await workspace.uploadDraftFile(imageDraft.id, imageDraft.revision, `fixture.${format}`, image);
          assert.equal(
            imageDraft.files.find((file) => file.filename === `fixture.${format}`).contentType,
            `image/${format}`,
          );
        }
        const pdf = await PDFDocument.create();
        pdf.addPage();
        const bytes = Buffer.from(await pdf.save());
        let attachmentDraft = await workspace.createDraft(payload, 1);
        await assert.rejects(
          workspace.uploadDraftFile(attachmentDraft.id, 1, "broken.pdf", Buffer.from("%PDF-broken")),
        );
        await assert.rejects(
          workspace.uploadDraftFile(attachmentDraft.id, 1, "oversized.pdf", Buffer.alloc(15 * 1024 * 1024 + 1)),
          /15 MB/,
        );
        for (let i = 0; i < 5; i++)
          attachmentDraft = await workspace.uploadDraftFile(
            attachmentDraft.id,
            attachmentDraft.revision,
            `fixture-${i}.pdf`,
            bytes,
          );
        assert.equal(attachmentDraft.files.length, 5);
        await assert.rejects(
          workspace.uploadDraftFile(attachmentDraft.id, attachmentDraft.revision, "sixth.pdf", bytes),
          /lima/,
        );
        assert.deepEqual(
          (await workspace.downloadDraftFile(attachmentDraft.id, attachmentDraft.files[0].id)).bytes,
          bytes,
        );
        const removedId = attachmentDraft.files[0].id;
        attachmentDraft = await workspace.removeDraftFile(attachmentDraft.id, attachmentDraft.revision, removedId);
        assert.equal(attachmentDraft.files.length, 4);
        await assert.rejects(workspace.downloadDraftFile(attachmentDraft.id, removedId), /ditemukan/);
        outcome = "sent";
        await assert.rejects(
          workspace.prepareDraft(attachmentDraft.id, attachmentDraft.revision),
          /Pemindai lampiran belum tersedia/,
        );
        const attachmentPreview = await workspace.prepareDraft(attachmentDraft.id, attachmentDraft.revision, true);
        await workspace.sendPreparedDraft(attachmentPreview.attemptId);
        assert.deepEqual((await workspace.downloadOutboxFile(attachmentPreview.attemptId, 0)).bytes, bytes);
        assert.equal(envelope.attachments.length, 4);
        const copied = await workspace.copyDraft(attachmentDraft.id, {
          ...attachmentDraft.payload,
          subject: "COPY WITH PRIVATE FILES",
        });
        assert.equal(copied.files.length, 4);
        assert.deepEqual((await workspace.downloadDraftFile(copied.id, copied.files[0].id)).bytes, bytes);

        // The real document policy runs against rollback fixtures; PDF bytes never leave this process.
        const schema = compile(resolve(__dirname, "../src/lib/database/schema.ts"), stubs);
        const policy = compile(resolve(__dirname, "../src/features/integrations/document-email-source.ts"), {
          ...stubs,
          "node:fs/promises": {
            stat: async () => ({ isFile: () => true, size: bytes.length }),
            readFile: async () => bytes,
          },
          "@/features/operations/docgen-policy": {
            docGenDummyMode: () => true,
            assertDocGenEmailAllowed: (kind, recipient) => {
              assert.equal(kind, "test");
              assert(["qa@example.invalid", "other@example.invalid"].includes(recipient));
            },
          },
        });
        const { calculateQuote } = compile(resolve(__dirname, "../src/features/operations/quote-math.ts"), stubs);
        const { readQuotationLetter } = compile(
          resolve(__dirname, "../src/features/operations/quotation-letter.ts"),
          stubs,
        );
        const suffix = require("node:crypto").randomUUID();
        const [customer] = await tx
          .insert(schema.customers)
          .values({
            code: suffix.slice(0, 25),
            legalName: "[UJI INTEGRASI]",
            displayName: "[UJI INTEGRASI]",
            email: "qa@example.invalid",
            billingAddress: "Gudang uji Bandung",
          })
          .returning();
        const letter = readQuotationLetter(null, "Uji spacer", customer.billingAddress);
        const [transaction] = await tx
          .insert(schema.businessTransactions)
          .values({
            referenceNo: suffix.slice(0, 30),
            customerId: customer.id,
            title: "Uji spacer",
            dataClass: "test",
            quoteLetter: letter,
          })
          .returning();
        const [line] = await tx
          .insert(schema.transactionLines)
          .values({
            transactionId: transaction.id,
            description: "Spacer uji",
            quantity: "100",
            unit: "pcs",
            unitPrice: "1000",
            taxRate: "12",
            taxMethod: "dpp_11_12",
            discountKind: "percent",
            discountValue: "10",
            materialLabel: "PP",
            mouldingLabel: "0",
          })
          .returning();
        const checksum = require("node:crypto").createHash("sha256").update(bytes).digest("hex");
        const quoteLine = Object.fromEntries(
          [
            "description",
            "quantity",
            "unit",
            "unitPrice",
            "taxRate",
            "taxMethod",
            "discountKind",
            "discountValue",
            "materialLabel",
            "mouldingLabel",
          ].map((key) => [key, line[key]]),
        );
        const [document] = await tx
          .insert(schema.transactionDocuments)
          .values({
            transactionId: transaction.id,
            type: "quotation",
            direction: "outbound",
            status: "ready",
            version: 1,
            checksum,
            storagePath: "integration-fixture.pdf",
            payload: { quote: calculateQuote([quoteLine]), letter, isDummy: true },
          })
          .returning();
        const documentSource = { transactionId: transaction.id, documentId: document.id, version: 1, checksum };
        const actions = compile(resolve(__dirname, "../src/features/integrations/actions.ts"), {
          ...stubs,
          "next/cache": { revalidatePath() {} },
          "next/navigation": {
            redirect() {
              throw new Error("REDIRECT");
            },
          },
        });
        await assert.rejects(actions.sendTransactionDocument(new FormData()), /Pengiriman langsung/);
        const badDocumentForm = new FormData();
        for (const [key, value] of Object.entries({
          transactionId: transaction.id,
          documentId: suffix,
          to: "qa@example.invalid",
          confirmedTo: "qa@example.invalid",
          subject: "[UJI] Surat jalan - aman",
          bodyJson: JSON.stringify(content),
        }))
          badDocumentForm.set(key, value);
        await assert.rejects(actions.prepareTransactionDocumentEmail(badDocumentForm), /Checksum dokumen/);
        badDocumentForm.set("subject", "[UJI] Surat\r\nBcc: other@example.invalid");
        await assert.rejects(actions.prepareTransactionDocumentEmail(badDocumentForm), /Invalid input/);
        const recipients = { to: ["qa@example.invalid"], cc: [], bcc: [] };
        assert.equal(
          (await policy.validateDocumentEmailSource(tx, documentSource, recipients, "[UJI] penawaran")).bytes.length,
          bytes.length,
        );
        assert.equal(
          (
            await policy.validateDocumentEmailSource(
              tx,
              documentSource,
              { ...recipients, cc: ["other@example.invalid"] },
              "[UJI]",
            )
          ).bytes.length,
          bytes.length,
          "transaction documents support the reviewed CC recipient",
        );
        await tx
          .update(schema.transactionLines)
          .set({ discountValue: "20" })
          .where(require("drizzle-orm").eq(schema.transactionLines.id, line.id));
        await assert.rejects(
          policy.validateDocumentEmailSource(tx, documentSource, recipients, "[UJI]"),
          /penawaran berubah/,
        );
        await tx
          .update(schema.transactionLines)
          .set({ discountValue: "10" })
          .where(require("drizzle-orm").eq(schema.transactionLines.id, line.id));
        await tx
          .update(schema.transactionDocuments)
          .set({ checksum: "wrong" })
          .where(require("drizzle-orm").eq(schema.transactionDocuments.id, document.id));
        await assert.rejects(
          policy.validateDocumentEmailSource(tx, documentSource, recipients, "[UJI]"),
          /Dokumen berubah/,
        );
        await tx
          .update(schema.transactionDocuments)
          .set({ checksum })
          .where(require("drizzle-orm").eq(schema.transactionDocuments.id, document.id));
        // Same service, no SMTP in simulation, mandatory archived PDF and transaction linkage.
        stubs["./document-email-source"] = policy;
        const documentWorkspace = compile(resolve(__dirname, "../src/features/integrations/email-drafts.ts"), stubs);
        const documentDraft = await documentWorkspace.createDraft(
          { ...payload, subject: "[UJI] dokumen", documentSource },
          1,
        );
        const documentPreview = await documentWorkspace.prepareDraft(documentDraft.id, 1);
        assert.equal(documentPreview.files.length, 1);
        process.env.EMAIL_CS_SEND_MODE = "simulate";
        const callsBeforeSimulation = calls;
        assert.equal((await documentWorkspace.sendPreparedDraft(documentPreview.attemptId)).status, "simulated");
        assert.equal(calls, callsBeforeSimulation);
        const [unchanged] = await tx
          .select()
          .from(schema.transactionDocuments)
          .where(require("drizzle-orm").eq(schema.transactionDocuments.id, document.id));
        assert.equal(unchanged.sentMessageId, null);
        assert.equal(unchanged.payload.sendState, undefined);
        assert.equal(unchanged.payload.lastEmailState, "simulated");
        assert.equal(unchanged.payload.lastEmailAttemptId, documentPreview.attemptId);
        await assert.rejects(documentWorkspace.sendPreparedDraft(documentPreview.attemptId));
        const eq = require("drizzle-orm").eq;
        const nextDraft = await documentWorkspace.createDraft(
          { ...payload, subject: "[UJI] modified after preview", documentSource },
          1,
        );
        const staleDocumentPreview = await documentWorkspace.prepareDraft(nextDraft.id, 1);
        await tx
          .update(schema.transactionLines)
          .set({ materialLabel: "HDPE" })
          .where(eq(schema.transactionLines.id, line.id));
        await assert.rejects(documentWorkspace.sendPreparedDraft(staleDocumentPreview.attemptId), /penawaran berubah/);
        assert.equal(calls, callsBeforeSimulation);
        await tx
          .update(schema.transactionLines)
          .set({ materialLabel: "PP" })
          .where(eq(schema.transactionLines.id, line.id));
        await tx
          .update(schema.transactionDocuments)
          .set({ type: "bast_signed" })
          .where(eq(schema.transactionDocuments.id, document.id));
        await assert.rejects(
          policy.validateDocumentEmailSource(tx, documentSource, recipients, "[UJI]"),
          /tidak dapat dikirim/,
        );
        await tx
          .update(schema.transactionDocuments)
          .set({ type: "quotation" })
          .where(eq(schema.transactionDocuments.id, document.id));
        const invoicePreview = { kind: "dp", amountDue: "100.00", dpApplied: "0.00", gross: "100.00" };
        const [invoice] = await tx
          .insert(schema.transactionInvoices)
          .values({
            transactionId: transaction.id,
            invoiceNo: `QA-${suffix}`,
            kind: "dp",
            amount: "100.00",
            status: "issued",
            snapshot: invoicePreview,
          })
          .returning();
        const [invoiceDocument] = await tx
          .insert(schema.transactionDocuments)
          .values({
            transactionId: transaction.id,
            invoiceId: invoice.id,
            documentNo: invoice.invoiceNo,
            type: "invoice_dp",
            direction: "outbound",
            status: "ready",
            checksum,
            storagePath: "integration-fixture.pdf",
            payload: { preview: invoicePreview, isDummy: true },
          })
          .returning();
        const invoiceSource = { ...documentSource, documentId: invoiceDocument.id };
        await policy.validateDocumentEmailSource(tx, invoiceSource, recipients, "[UJI] invoice");
        await tx
          .update(schema.transactionInvoices)
          .set({ amount: "101.00" })
          .where(eq(schema.transactionInvoices.id, invoice.id));
        await assert.rejects(
          policy.validateDocumentEmailSource(tx, invoiceSource, recipients, "[UJI] invoice"),
          /Snapshot invoice/,
        );
        await tx
          .update(schema.transactionInvoices)
          .set({ amount: "100.00", status: "cancelled" })
          .where(eq(schema.transactionInvoices.id, invoice.id));
        await assert.rejects(
          policy.validateDocumentEmailSource(tx, invoiceSource, recipients, "[UJI] invoice"),
          /dibatalkan/,
        );

        const benchmarkPrefix = `UJI-INTEGRATION-BENCH-${suffix.slice(0, 8)}`;
        await tx.execute(
          sql`insert into business_transactions(reference_no,customer_id,title,data_class,updated_at) select ${suffix.slice(0, 8)}||'-'||g,${customer.id}::uuid,${benchmarkPrefix}||'-'||g,'production',now()-g*interval '1 second' from generate_series(1,1000) g`,
        );
        await tx.execute(
          sql`insert into transaction_lines(transaction_id,description,quantity,unit,unit_price,tax_rate,tax_method,discount_kind,discount_value) select id,'Spacer uji',100,'pcs',1000,12,'dpp_11_12','percent',10 from business_transactions where title like ${benchmarkPrefix + "%"}`,
        );
        const operations = compile(resolve(__dirname, "../src/features/operations/service.ts"), stubs);
        const transactionTimings = [];
        for (let i = 0; i < 10; i++) {
          const start = performance.now();
          const page = await operations.getTransactionPage({ search: benchmarkPrefix });
          assert.equal(page.rows.length, 25);
          assert.equal(page.rows[0].workspace.quote, "99900.00");
          transactionTimings.push(performance.now() - start);
        }
        transactionTimings.sort((a, b) => a - b);
        assert(transactionTimings[9] < 1000);
        context.diagnostic(
          `1k grouped transaction page p95: ${transactionTimings[9].toFixed(1)} ms; fixtures rolled back`,
        );
        process.env.EMAIL_CS_SEND_MODE = "live";
        context.diagnostic(
          "Document checksum, recipient, changed-discount policy, mandatory snapshot and no-SMTP simulation verified; fixtures rolled back",
        );
        await tx.execute(
          sql`insert into cs_emails(folder,uid_validity,uid,size,subject,from_address,message_id,thread_key,received_at) select 'inbox','TEST-EMAIL-ROLLBACK',g,0,'TEST EMAIL BENCHMARK '||g,'fixture@example.invalid','<fixture-'||g||'@example.invalid>','<fixture-'||g||'@example.invalid>',now()-g*interval '1 second' from generate_series(1,10000) g`,
        );
        const first = await conversations.listConversations("inbox", undefined, "TEST EMAIL BENCHMARK");
        assert.equal(first.items.length, 25);
        assert(first.next);
        const second = await conversations.listConversations("inbox", first.next, "TEST EMAIL BENCHMARK");
        assert.equal(second.items.length, 25);
        assert(!second.items.some((row) => first.items.some((other) => other.id === row.id)));
        const timings = [];
        for (let i = 0; i < 10; i++) {
          const start = performance.now();
          await conversations.listConversations("inbox", undefined, "TEST EMAIL BENCHMARK");
          timings.push(performance.now() - start);
        }
        timings.sort((a, b) => a - b);
        context.diagnostic(`10k cached metadata p95: ${timings[9].toFixed(1)} ms; fixtures rolled back`);
        assert(timings[9] < 1000, "cached metadata p95 must remain below one second");
        throw rollback;
      }),
      (error) => {
        if (error !== rollback) context.diagnostic(String(error?.stack ?? error));
        return error === rollback;
      },
    );
  } finally {
    for (const [key, value] of Object.entries({
      EMAIL_CS_SEND_MODE: prior.mode,
      EMAIL_CS_TEST_RECIPIENTS: prior.recipients,
      NODE_ENV: prior.node,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await pool.end();
  }
});
