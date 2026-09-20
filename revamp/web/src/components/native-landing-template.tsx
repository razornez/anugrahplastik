import type { LandingContent } from "@/features/content/landing-content";
import { renderLandingTemplate } from "@/features/marketing/template-source";
import { LandingInteractions } from "./landing-interactions";

export function NativeLandingTemplate({ content }: { content: LandingContent }) {
  const template = renderLandingTemplate(content);

  return (
    <main className="native-template-shell">
      <style dangerouslySetInnerHTML={{ __html: template.styles }} />
      <div dangerouslySetInnerHTML={{ __html: template.markup }} />
      <LandingInteractions />
    </main>
  );
}
