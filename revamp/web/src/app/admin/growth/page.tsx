import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin-page-header";
import { MarketingWorkspaceNav } from "@/components/marketing-workspace-nav";
import { GrowthVisitorChart } from "@/components/growth-visitor-chart";
import { SeoRankingCard } from "@/components/seo-ranking-card";
import { GrowthOpportunityBoard } from "@/components/growth-opportunity-board";
import { GrowthRadarWorkspace } from "@/components/growth-radar-workspace";
import { BusinessDiscoveryPanel } from "@/components/business-discovery-panel";
import { getBusinessBoard } from "@/features/analytics/business-discovery-service";
import { getVisitorCohorts } from "@/features/analytics/visitor-cohorts";
import { getCompetitorVisibility } from "@/features/analytics/competitor-visibility";
import { getSearchOpportunities } from "@/features/analytics/opportunity-service";
import { getSession } from "@/lib/auth/session";
import "./growth-insights.css";

export const instant = false;

export default async function GrowthPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; radar?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/admin/login");
  const query = await searchParams;
  const days = query.days === "7" ? 7 : 30;
  const [cohorts, competitorData, opportunities, business] = await Promise.all([
    user.role === "content" ? Promise.resolve(null) : getVisitorCohorts(days),
    getCompetitorVisibility(),
    getSearchOpportunities(),
    ["admin", "sales"].includes(user.role) ? getBusinessBoard() : Promise.resolve(null),
  ]);
  const seo = opportunities.seo;

  return (
    <div className="growth-page">
      <AdminPageHeader
        title="Pemasaran"
        description="Pantau kunjungan website, visibilitas pencarian, dan peluang pertumbuhan."
      />
      <div className="growth-intro">
        <section className="growth-visitor" aria-labelledby="growth-visitor-title">
          <div className="growth-visitor__head">
            <div>
              <h2 id="growth-visitor-title">Pengunjung baru dan yang kembali</h2>
            </div>
            <nav aria-label="Pilih periode grafik pengunjung" className="growth-visitor__period">
              <Link href="/admin/growth?days=7" aria-current={days === 7 ? "page" : undefined}>
                7 hari
              </Link>
              <Link href="/admin/growth?days=30" aria-current={days === 30 ? "page" : undefined}>
                30 hari
              </Link>
            </nav>
          </div>
          {cohorts?.available ? (
            <GrowthVisitorChart data={cohorts} />
          ) : (
            <p className="growth-visitor__unavailable">
              {user.role === "content"
                ? "Laporan pengunjung tersedia untuk sales dan administrator."
                : "Data pengunjung belum tersedia."}
            </p>
          )}
          <p className="growth-visitor__note">
            “Baru” berarti pertama kali terlihat dalam riwayat yang masih tersimpan (maksimal 90 hari), bukan orang yang
            belum pernah datang. Ringkasan menghitung perangkat unik selama periode; grafik menghitungnya lagi bila
            kembali pada hari lain. Satu perangkat dapat mewakili lebih dari satu orang.
          </p>
        </section>
        <SeoRankingCard
          audit={seo.audit}
          competitors={competitorData.competitors}
          error={seo.error}
          stale={seo.stale}
        />
      </div>
      <MarketingWorkspaceNav current="/admin/growth" role={user.role} />
      <GrowthRadarWorkspace
        initialTab={query.radar === "marketing" ? "marketing" : "business"}
        business={business ? <BusinessDiscoveryPanel data={business} isAdmin={user.role === "admin"} /> : undefined}
        marketing={
          <GrowthOpportunityBoard
            embedded
            items={opportunities.items}
            seoDate={seo.audit?.checkedAt ?? null}
            seoNotice={seo.error}
            trendDate={opportunities.market.signal?.checkedAt ?? null}
            trendNotice={opportunities.market.error}
            trendAttemptedAt={opportunities.market.attemptedAt}
            needDate={opportunities.searchDiscovery.discovery?.checkedAt ?? null}
            needStatus={opportunities.searchDiscovery.status}
            needNotice={opportunities.searchDiscovery.error}
            budget={opportunities.budget}
            visibleAds={
              seo.audit?.results
                .flatMap((result) =>
                  (result.visibleAds ?? []).slice(0, 2).map((ad) => ({ ...ad, keyword: result.keyword })),
                )
                .slice(0, 12) ?? []
            }
            canReview={user.role === "admin"}
          />
        }
      />
    </div>
  );
}
