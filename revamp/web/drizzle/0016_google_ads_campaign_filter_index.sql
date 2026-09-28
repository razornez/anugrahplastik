CREATE INDEX IF NOT EXISTS google_ads_campaign_date_idx
  ON google_ads_daily_reports (campaign_id, report_date);
