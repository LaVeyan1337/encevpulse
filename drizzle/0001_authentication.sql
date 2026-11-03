CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  email text NOT NULL,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  must_change_password boolean NOT NULL DEFAULT false,
  password_expires_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_username_normalized CHECK (username = lower(btrim(username)) AND username ~ '^[a-z0-9][a-z0-9._-]{1,31}$'),
  CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)) AND email ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@encev[.]com[.]tr$'),
  CONSTRAINT users_display_name_nonempty CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
  CONSTRAINT users_password_hash_nonempty CHECK (length(password_hash) > 0)
);

CREATE UNIQUE INDEX users_username_unique ON users (username);
CREATE UNIQUE INDEX users_email_unique ON users (email);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  display_name text NOT NULL
);

INSERT INTO roles (code, display_name)
VALUES ('employee', 'Çalışan'), ('system_admin', 'Sistem yöneticisi');

CREATE TABLE user_role_assignments (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX user_role_assignments_role_user_idx ON user_role_assignments (role_id, user_id);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_token_hash char(64) NOT NULL UNIQUE,
  csrf_token_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT auth_sessions_expiry_order CHECK (idle_expires_at <= expires_at)
);

CREATE INDEX auth_sessions_user_active_idx ON auth_sessions (user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions (expires_at);

CREATE TABLE auth_csrf_challenges (
  challenge_hash char(64) PRIMARY KEY,
  origin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CONSTRAINT auth_csrf_challenges_expiry_order CHECK (expires_at > created_at)
);

CREATE INDEX auth_csrf_challenges_expiry_idx ON auth_csrf_challenges (expires_at) WHERE consumed_at IS NULL;

CREATE TABLE auth_rate_limit_buckets (
  dimension_hash char(64) NOT NULL,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dimension_hash, window_started_at)
);

CREATE INDEX auth_rate_limit_buckets_cleanup_idx ON auth_rate_limit_buckets (window_started_at);

CREATE TABLE auth_bootstrap_state (
  singleton_key text PRIMARY KEY CHECK (singleton_key = 'initial_admin'),
  completed_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE auth_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  request_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX auth_audit_events_target_time_idx ON auth_audit_events (target_user_id, occurred_at DESC);

CREATE FUNCTION prevent_auth_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'auth audit events are append-only';
END;
$$;

CREATE TRIGGER auth_audit_events_append_only
BEFORE UPDATE OR DELETE ON auth_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_auth_audit_mutation();
