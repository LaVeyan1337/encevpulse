-- Browser-based e-ÇED observation and account reservation.
-- The extension only sends explicitly selected visible account labels and sanitized tab metadata.
UPDATE app_modules SET is_enabled = true WHERE module_key IN ('eced','petitions');

CREATE TABLE eced_browser_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_name text NOT NULL CHECK (length(btrim(device_name)) BETWEEN 2 AND 80),
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX eced_browser_devices_user_idx ON eced_browser_devices(user_id,created_at DESC);
CREATE INDEX eced_browser_devices_active_idx ON eced_browser_devices(last_seen_at DESC) WHERE revoked_at IS NULL;

CREATE TABLE eced_browser_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES eced_browser_devices(id) ON DELETE RESTRICT,
  report_id char(24) NOT NULL CHECK (report_id ~ '^[0-9a-f]{24}$'),
  browser text NOT NULL DEFAULT 'unknown' CHECK (length(browser) <= 24),
  tab_id text NOT NULL DEFAULT '' CHECK (length(tab_id) <= 24),
  tab_title text NOT NULL DEFAULT '' CHECK (length(tab_title) <= 120),
  portal_origin text NOT NULL CHECK (length(portal_origin) BETWEEN 8 AND 180),
  page_path text NOT NULL DEFAULT '/' CHECK (length(page_path) <= 160),
  active_ui_tab text NOT NULL DEFAULT '' CHECK (length(active_ui_tab) <= 60),
  account_name text NOT NULL DEFAULT '' CHECK (length(account_name) <= 100),
  normalized_account text NOT NULL DEFAULT '' CHECK (length(normalized_account) <= 110),
  account_source text NOT NULL DEFAULT 'unknown' CHECK (account_source IN ('manual','portal','unknown')),
  session_state text NOT NULL DEFAULT 'unknown' CHECK (session_state IN ('active','logged_out','unknown')),
  tab_active boolean NOT NULL DEFAULT false,
  last_seen timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id,report_id)
);
CREATE INDEX eced_browser_reports_recent_idx ON eced_browser_reports(last_seen DESC);
CREATE INDEX eced_browser_reports_account_idx ON eced_browser_reports(normalized_account,last_seen DESC)
  WHERE normalized_account <> '';

CREATE TABLE eced_seen_accounts (
  normalized_account text PRIMARY KEY CHECK (length(normalized_account) BETWEEN 1 AND 110),
  account_name text NOT NULL CHECK (length(account_name) BETWEEN 1 AND 100),
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  last_device_id uuid REFERENCES eced_browser_devices(id) ON DELETE SET NULL,
  last_device_name text NOT NULL DEFAULT '' CHECK (length(last_device_name) <= 80)
);
CREATE INDEX eced_seen_accounts_last_seen_idx ON eced_seen_accounts(last_seen DESC);

CREATE TABLE eced_account_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_account text NOT NULL UNIQUE CHECK (length(normalized_account) BETWEEN 1 AND 110),
  account_name text NOT NULL CHECK (length(account_name) BETWEEN 1 AND 100),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL REFERENCES eced_browser_devices(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX eced_account_claims_expiry_idx ON eced_account_claims(expires_at);

CREATE TABLE eced_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  device_id uuid REFERENCES eced_browser_devices(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 2 AND 60),
  normalized_account text NOT NULL DEFAULT '' CHECK (length(normalized_account) <= 110),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eced_audit_events_time_idx ON eced_audit_events(occurred_at DESC);

CREATE FUNCTION prevent_eced_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'e-ÇED audit events are append-only';
END;
$$;
CREATE TRIGGER eced_audit_events_append_only BEFORE UPDATE OR DELETE ON eced_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_eced_audit_mutation();
