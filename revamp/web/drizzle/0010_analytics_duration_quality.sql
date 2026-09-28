ALTER TABLE "analytics_sessions"
  ADD COLUMN "duration_quality" varchar(24) NOT NULL DEFAULT 'unverified';
