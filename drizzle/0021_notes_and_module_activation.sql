-- Activate modules that have real application flows and add private notes.
-- Drive remains disabled until an explicitly approved, permission-preserving source adapter exists.
-- Petitions remains disabled until approved DOCX field mapping and workflow states are implemented.
UPDATE app_modules
SET is_enabled = true
WHERE module_key IN ('calendar','institution_opinions','eced','notes','settings');

-- Personal calendar access is safe because event ownership and visibility are enforced by CalendarService.
INSERT INTO role_module_permissions(role_id,module_key,permission_key)
SELECT r.id,'calendar',p.permission_key
FROM roles r
CROSS JOIN (VALUES ('view'),('create'),('update'),('delete')) AS p(permission_key)
WHERE r.code IN ('employee','team_lead','project_manager','process_owner','document_steward')
ON CONFLICT DO NOTHING;

INSERT INTO role_module_permissions(role_id,module_key,permission_key)
SELECT r.id,'calendar','view'
FROM roles r
WHERE r.code='auditor'
ON CONFLICT DO NOTHING;

-- Notes are private to their owner regardless of role; the same CRUD capability is
-- therefore safe to grant across roles without exposing another user's records.
INSERT INTO role_module_permissions(role_id,module_key,permission_key)
SELECT r.id,'notes',p.permission_key
FROM roles r
CROSS JOIN (VALUES ('view'),('create'),('update'),('delete')) AS p(permission_key)
ON CONFLICT DO NOTHING;

-- Process owners may archive their own scoped opinion and e-ÇED records.
INSERT INTO role_module_permissions(role_id,module_key,permission_key)
SELECT r.id,d.module_key,'delete'
FROM roles r
CROSS JOIN (VALUES ('institution_opinions'),('eced')) AS d(module_key)
WHERE r.code='process_owner'
ON CONFLICT DO NOTHING;

CREATE TABLE user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 20000),
  tags text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(tags) <= 12),
  project_id uuid REFERENCES projects(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_notes_owner_updated_idx
  ON user_notes(owner_user_id,updated_at DESC,id)
  WHERE archived_at IS NULL;
CREATE INDEX user_notes_owner_archived_idx
  ON user_notes(owner_user_id,updated_at DESC,id)
  WHERE archived_at IS NOT NULL;
CREATE INDEX user_notes_project_idx
  ON user_notes(project_id)
  WHERE project_id IS NOT NULL;

CREATE TABLE user_note_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES user_notes(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('created','updated','archived','restored')),
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_note_audit_events_note_time_idx
  ON user_note_audit_events(note_id,occurred_at DESC);

CREATE FUNCTION prevent_user_note_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'user note audit events are append-only';
END;
$$;

CREATE TRIGGER user_note_audit_events_append_only
BEFORE UPDATE OR DELETE ON user_note_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_user_note_audit_mutation();
