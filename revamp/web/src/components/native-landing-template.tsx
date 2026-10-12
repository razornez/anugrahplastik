import type { LandingContent } from "@/features/content/landing-content";
import { renderLandingTemplate } from "@/features/marketing/template-source";
import { AnalyticsTracker } from "./analytics-tracker";
import { GoogleAdsConversionTracker } from "./google-ads-conversion-tracker";
import { LandingInteractions } from "./landing-interactions";

export function NativeLandingTemplate({ content, preview = false }: { content: LandingContent; preview?: boolean }) {
  const markup = renderLandingTemplate(content);

  return (
    <main className="native-template-shell">
      <div dangerouslySetInnerHTML={{ __html: markup }} />
      <LandingInteractions />
      {!preview ? <AnalyticsTracker /> : null}
      {!preview ? (
        <GoogleAdsConversionTracker
          tagId={process.env.GOOGLE_ADS_TAG_ID}
          leadLabel={process.env.GOOGLE_ADS_LEAD_CONVERSION_LABEL}
        />
      ) : null}
    </main>
  );
}
