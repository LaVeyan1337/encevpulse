ALTER TABLE projects
  ADD COLUMN owner_user_id uuid,
  ADD COLUMN starts_on date,
  ADD COLUMN target_on date,
  ADD COLUMN status_before_archive text,
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);

UPDATE projects
SET owner_user_id = created_by
WHERE owner_user_id IS NULL;

UPDATE projects
SET archived_at = COALESCE(archived_at, now())
WHERE status = 'archived';

ALTER TABLE projects
  ALTER COLUMN owner_user_id SET NOT NULL,
  ADD CONSTRAINT projects_owner_user_fk FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS projects_status_check,
  ADD CONSTRAINT projects_status_check CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'archived')),
  ADD CONSTRAINT projects_date_order CHECK (starts_on IS NULL OR target_on IS NULL OR starts_on <= target_on),
  ADD CONSTRAINT projects_status_before_archive_check CHECK (
    status_before_archive IS NULL OR status_before_archive IN ('planning', 'active', 'on_hold', 'completed')
  );

CREATE INDEX projects_owner_status_target_idx
  ON projects (owner_user_id, status, target_on)
  WHERE archived_at IS NULL;

CREATE TABLE project_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'updated', 'member_added', 'member_removed', 'archived', 'restored')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_audit_events_project_time_idx
  ON project_audit_events (project_id, created_at DESC);

CREATE FUNCTION prevent_project_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'project audit events are append-only';
END;
$$;

CREATE TRIGGER project_audit_events_append_only
BEFORE UPDATE OR DELETE ON project_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_project_audit_mutation();
