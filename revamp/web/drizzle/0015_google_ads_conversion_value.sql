ALTER TABLE google_ads_daily_reports
  ADD COLUMN IF NOT EXISTS conversions_value varchar(40) NOT NULL DEFAULT '0';
