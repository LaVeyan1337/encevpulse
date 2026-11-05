-- Independent, user-maintained institution directory.
-- Existing project-captured contacts remain private to their linked project opinions.
-- They are not silently promoted into the shared directory.

ALTER TABLE ced_institution_contacts
  ADD COLUMN directory_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN institution_type text NOT NULL DEFAULT '',
  ADD COLUMN website text NOT NULL DEFAULT '',
  ADD COLUMN source_label text NOT NULL DEFAULT 'Kurum Görüşü kaydı',
  ADD COLUMN source_reference text NOT NULL DEFAULT '',
  ADD COLUMN source_verified_at date,
  ADD COLUMN source_verified_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT ced_institution_contacts_type_length CHECK (length(institution_type) <= 120),
  ADD CONSTRAINT ced_institution_contacts_website_length CHECK (length(website) <= 300),
  ADD CONSTRAINT ced_institution_contacts_source_label_length CHECK (length(btrim(source_label)) BETWEEN 2 AND 180),
  ADD CONSTRAINT ced_institution_contacts_source_reference_length CHECK (length(source_reference) <= 500),
  ADD CONSTRAINT ced_institution_contacts_version_positive CHECK (version >= 1);

CREATE UNIQUE INDEX institution_directory_unique_contact
  ON ced_institution_contacts (
    lower(btrim(institution_name)),
    lower(btrim(contact_person)),
    lower(btrim(email))
  )
  WHERE directory_visible = true AND archived_at IS NULL;

CREATE INDEX institution_directory_search_idx
  ON ced_institution_contacts (lower(institution_name), lower(contact_person), lower(department))
  WHERE directory_visible = true AND archived_at IS NULL;

CREATE TABLE institution_directory_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES ced_institution_contacts(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('created','updated','archived')),
  changed_fields text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX institution_directory_audit_contact_idx
  ON institution_directory_audit_events(contact_id,created_at DESC);

CREATE OR REPLACE FUNCTION prevent_institution_directory_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'institution directory audit events are append-only';
END;
$$;

CREATE TRIGGER institution_directory_audit_events_append_only
BEFORE UPDATE OR DELETE ON institution_directory_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_institution_directory_audit_mutation();

-- The standalone directory is now independent of project-opinion visibility.
-- Only users with an explicit module grant can read it; writes use narrower role grants.
UPDATE app_modules SET is_enabled = true WHERE module_key = 'institution_guide';

INSERT INTO role_module_permissions(role_id,module_key,permission_key)
SELECT r.id,d.module_key,d.permission_key
FROM (VALUES
  ('employee','institution_guide','view'),
  ('team_lead','institution_guide','view'),
  ('project_manager','institution_guide','view'),
  ('process_owner','institution_guide','view'),
  ('process_owner','institution_guide','create'),
  ('process_owner','institution_guide','update'),
  ('process_owner','institution_guide','delete'),
  ('document_steward','institution_guide','view'),
  ('document_steward','institution_guide','create'),
  ('document_steward','institution_guide','update'),
  ('document_steward','institution_guide','delete'),
  ('auditor','institution_guide','view')
) AS d(role_code,module_key,permission_key)
JOIN roles r ON r.code=d.role_code
ON CONFLICT DO NOTHING;
