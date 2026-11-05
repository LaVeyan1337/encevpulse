-- Calendar foundation: real events plus read-only projections of task/project dates.
UPDATE app_modules
SET is_enabled = true
WHERE module_key = 'calendar';

INSERT INTO role_module_permissions(role_id,module_key,permission_key)
SELECT r.id,'calendar',d.permission_key
FROM roles r
JOIN (VALUES
  ('project_manager','delete'),
  ('process_owner','delete'),
  ('system_admin','view'),
  ('system_admin','create'),
  ('system_admin','update'),
  ('system_admin','delete')
) AS d(role_code,permission_key) ON d.role_code=r.code
ON CONFLICT DO NOTHING;

CREATE TABLE calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  event_type text NOT NULL DEFAULT 'event'
    CHECK (event_type IN ('meeting','event','reminder','deadline')),
  visibility text NOT NULL DEFAULT 'personal'
    CHECK (visibility IN ('personal','shared','project')),
  project_id uuid REFERENCES projects(id) ON DELETE RESTRICT,
  all_day boolean NOT NULL DEFAULT false,
  starts_at timestamptz,
  ends_at timestamptz,
  starts_on date,
  ends_on date,
  location text NOT NULL DEFAULT '' CHECK (length(location) <= 200),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT calendar_event_project_visibility_check CHECK (
    (visibility = 'project' AND project_id IS NOT NULL) OR
    (visibility <> 'project' AND project_id IS NULL)
  ),
  CONSTRAINT calendar_event_time_shape_check CHECK (
    (all_day = true AND starts_on IS NOT NULL AND ends_on IS NOT NULL
      AND starts_on <= ends_on AND starts_at IS NULL AND ends_at IS NULL) OR
    (all_day = false AND starts_at IS NOT NULL AND ends_at IS NOT NULL
      AND ends_at > starts_at AND starts_on IS NULL AND ends_on IS NULL)
  )
);

CREATE INDEX calendar_events_timed_range_idx
  ON calendar_events (starts_at, ends_at)
  WHERE archived_at IS NULL AND all_day = false;

CREATE INDEX calendar_events_all_day_range_idx
  ON calendar_events (starts_on, ends_on)
  WHERE archived_at IS NULL AND all_day = true;

CREATE INDEX calendar_events_project_idx
  ON calendar_events (project_id, starts_at)
  WHERE archived_at IS NULL AND project_id IS NOT NULL;

CREATE TABLE calendar_event_attendees (
  event_id uuid NOT NULL REFERENCES calendar_events(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  added_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX calendar_event_attendees_user_idx
  ON calendar_event_attendees (user_id, event_id);

CREATE TABLE calendar_event_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES calendar_events(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('created','updated','archived')),
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX calendar_event_audit_time_idx
  ON calendar_event_audit_events (event_id, occurred_at DESC);

CREATE FUNCTION prevent_calendar_event_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'calendar event audit events are append-only';
END;
$$;

CREATE TRIGGER calendar_event_audit_events_append_only
BEFORE UPDATE OR DELETE ON calendar_event_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_calendar_event_audit_mutation();
