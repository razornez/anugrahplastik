import "server-only";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/lib/database/client";
import { encodeTimeCursor } from "@/lib/pagination/cursor";

function decodeTimeCursor(value?: string): { createdAt: string; id: string } | null {
  if (!value || value.length > 300) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof cursor.createdAt !== "string" ||
      !Number.isFinite(Date.parse(cursor.createdAt)) ||
      typeof cursor.id !== "string" ||
      !/^(?:(?:mailbox|outbox):)?[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(cursor.id)
    )
      return null;
    return cursor;
  } catch {
    return null;
  }
}

type MailRow = {
  id: string;
  folder: string;
  key: string;
  subject: string;
  fromName: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  receivedAt: string;
  status: string;
  source: "mailbox" | "workspace";
  messageId: string | null;
  count: number;
};
const messages = sql`with messages as (
 select concat('mailbox:',m.id) as id,m.folder,coalesce(nullif(m.thread_key,''),p.thread_key,nullif(m.in_reply_to,''),nullif(m.message_id,''),concat('mailbox:',m.id)) as key,
 m.subject,m.from_name as "fromName",m.from_address as "fromAddress",m.to_address as "toAddress",date_trunc('milliseconds',coalesce(m.received_at,m.created_at)) as "receivedAt",case when m.folder='sent' then 'sent' else 'received' end as status,'mailbox' as source,m.message_id as "messageId"
 from cs_emails m left join lateral (select thread_key from cs_emails where message_id=m.in_reply_to and thread_key is not null order by created_at limit 1) p on true
 union all
 select concat('outbox:',o.id),'sent',coalesce(p.thread_key,nullif(o.in_reply_to,''),nullif(o.message_id,''),concat('outbox:',o.id)),o.subject,'Anugrah Plastik',null,o.to_address,date_trunc('milliseconds',o.sent_at),o.status,'workspace',o.message_id
 from cs_email_outbox o left join lateral (select thread_key from cs_emails where message_id=o.in_reply_to and thread_key is not null order by created_at limit 1) p on true
 where o.status not in ('prepared','stale')
)`;

export async function listConversations(folder: "inbox" | "sent", before?: string, search?: string, status?: string) {
  const database = getDatabase();
  if (!database) return null;
  const cursor = decodeTimeCursor(before);
  const statusFilter = ["sent", "partial", "failed", "uncertain", "pending", "simulated"].includes(status ?? "")
    ? status
    : null;
  const q = (search ?? "")
    .replace(/[\\%_]/g, " ")
    .trim()
    .slice(0, 120);
  const result =
    await database.execute(sql`${messages}, deduplicated_counts as (select m.*, row_number() over(partition by key, coalesce("messageId",id) order by id) as duplicate from messages m), counted as (select m.*, sum(case when duplicate=1 then 1 else 0 end) over(partition by key)::int as count from deduplicated_counts m), ranked as (
 select m.*,row_number() over(partition by m.key order by m."receivedAt" desc,m.id desc) as rank
 from counted m where m.folder=${folder} and (${!statusFilter} or m.status=${statusFilter}) and (${!q} or m.subject ilike ${`%${q}%`} or m."fromAddress" ilike ${`%${q}%`} or m."toAddress" ilike ${`%${q}%`})
 ) select * from ranked where rank=1 ${cursor ? sql`and ("receivedAt"<${new Date(cursor.createdAt)} or ("receivedAt"=${new Date(cursor.createdAt)} and id<${cursor.id.startsWith("mailbox:") || cursor.id.startsWith("outbox:") ? cursor.id : `mailbox:${cursor.id}`}))` : sql``} order by "receivedAt" desc,id desc limit 26`);
  const rows = result.rows as unknown as MailRow[];
  const items = rows.slice(0, 25);
  const last = items.at(-1);
  return {
    items,
    next: rows.length > 25 && last ? encodeTimeCursor({ createdAt: new Date(last.receivedAt), id: last.id }) : null,
  };
}

export async function conversationMessages(selected: string, before?: string) {
  const database = getDatabase();
  if (!database) return { items: [], hasMore: false };
  const cursor = decodeTimeCursor(before);
  const result =
    await database.execute(sql`${messages}, picked as (select key from messages where id=${selected}), distinct_messages as (
 select *,row_number() over(partition by coalesce("messageId",id) order by case when source='workspace' then 0 else 1 end,id) as duplicate from messages where key=(select key from picked limit 1)
 ) select * from distinct_messages where duplicate=1 ${cursor ? sql`and ("receivedAt"<${new Date(cursor.createdAt)} or ("receivedAt"=${new Date(cursor.createdAt)} and id<${cursor.id}))` : sql``} order by "receivedAt" desc,id desc limit 21`);
  const rows = result.rows as unknown as MailRow[];
  const items = rows.slice(0, 20);
  const last = items.at(-1);
  return {
    items,
    hasMore: rows.length > 20,
    next:
      rows.length > 20 && last ? encodeTimeCursor({ createdAt: new Date(last.receivedAt), id: last.id }) : undefined,
  };
}
