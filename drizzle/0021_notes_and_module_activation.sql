-- Activate modules that have real application flows and add private notes.
-- Drive remains disabled until an explicitly approved, permission-preserving source adapter exists.
-- Enable the current browser-local DOCX copy workflow; NAS, field mapping and shared approval remain unavailable.
UPDATE app_modules
SET is_enabled = true
WHERE module_key IN ('calendar','institution_opinions','eced','institution_guide','petitions','notes','settings');

-- Petitions is enabled for the browser-local template-copy workflow only.
-- Existing process_owner create/update and auditor view grants are retained.
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
-- The standalone read-only guide uses the same project-scoped directory records as opinions.
INSERT INTO role_module_permissions(role_id,module_key,permission_key)
SELECT r.id,'institution_guide','view'
FROM roles r
ON CONFLICT DO NOTHING;

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

-- Project managers own the delivery scope of the project-linked opinion and e-ÇED processes.
INSERT INTO role_module_permissions(role_id,module_key,permission_key)
SELECT r.id,d.module_key,d.permission_key
FROM roles r
CROSS JOIN (VALUES
  ('institution_opinions','view'),('institution_opinions','create'),('institution_opinions','update'),
  ('eced','view'),('eced','create'),('eced','update')
) AS d(module_key,permission_key)
WHERE r.code='project_manager'
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

-- Notes may also reference a task, but only when the owner can already access that task.
ALTER TABLE user_notes
  ADD COLUMN task_id uuid REFERENCES tasks(id) ON DELETE RESTRICT;

CREATE INDEX user_notes_task_idx
  ON user_notes(task_id)
  WHERE task_id IS NOT NULL;
