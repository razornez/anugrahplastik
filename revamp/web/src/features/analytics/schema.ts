import { z } from "zod";

export const analyticsEventNames = [
  "page_view",
  "page_leave",
  "scroll_depth",
  "section_engaged",
  "menu_click",
  "cta_click",
  "portfolio_open",
  "faq_open",
  "form_start",
  "form_abandon",
  "form_submit",
  "whatsapp_click",
] as const;

export type AnalyticsEventName = (typeof analyticsEventNames)[number];

const shortKey = z.string().trim().min(1).max(160);

export const analyticsEventSchema = z.object({
  name: z.enum(analyticsEventNames),
  path: z.string().startsWith("/").max(500),
  sectionKey: shortKey.optional(),
  elementKey: shortKey.optional(),
  metadata: z.record(z.string().max(50), z.union([z.string().max(120), z.number().finite(), z.boolean()])).optional(),
  conversionId: z.string().uuid().optional(),
  occurredAt: z.string().datetime().optional(),
});

export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;

export const analyticsBatchSchema = z.object({
  anonymousId: z.string().uuid(),
  sessionKey: z.string().uuid(),
  events: z.array(analyticsEventSchema).min(1).max(25),
  consentVersion: z.literal("v1"),
});

export type AnalyticsBatch = z.infer<typeof analyticsBatchSchema>;
