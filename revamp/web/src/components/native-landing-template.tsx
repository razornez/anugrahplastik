import type { LandingContent } from "@/features/content/landing-content";
import { renderLandingTemplate } from "@/features/marketing/template-source";
import { AnalyticsTracker } from "./analytics-tracker";
import { LandingInteractions } from "./landing-interactions";

export function NativeLandingTemplate({ content }: { content: LandingContent }) {
  const markup = renderLandingTemplate(content);

  return (
    <main className="native-template-shell">
      <div dangerouslySetInnerHTML={{ __html: markup }} />
      <LandingInteractions />
      <AnalyticsTracker />
    </main>
  );
}
