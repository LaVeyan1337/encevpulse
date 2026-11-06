-- Shared, versioned petition templates and generated DOCX records.
-- All bytes remain in PULSE PostgreSQL. No NAS/SMB path is read or written.

CREATE TABLE petition_template_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT petition_template_name_length CHECK (length(btrim(name)) BETWEEN 2 AND 160),
  CONSTRAINT petition_template_description_length CHECK (length(description) <= 1000)
);

CREATE UNIQUE INDEX petition_template_active_name_idx
  ON petition_template_families(lower(btrim(name)))
  WHERE is_active = true AND archived_at IS NULL;


CREATE TABLE petition_template_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES petition_template_families(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('created','version_added','archived')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX petition_template_audit_time_idx
  ON petition_template_audit_events(template_id,created_at DESC);

CREATE FUNCTION prevent_petition_template_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $petition_template_audit$
BEGIN
  RAISE EXCEPTION 'petition template audit events are append-only';
END;
$petition_template_audit$;

CREATE TRIGGER petition_template_audit_events_append_only
BEFORE UPDATE OR DELETE ON petition_template_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_petition_template_audit_mutation();

CREATE TABLE petition_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES petition_template_families(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version >= 1),
  file_name text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 12582912),
  content bytea NOT NULL,
  field_keys text[] NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT petition_template_version_unique UNIQUE(template_id,version),
  CONSTRAINT petition_template_version_filename_length CHECK (length(file_name) BETWEEN 1 AND 180),
  CONSTRAINT petition_template_version_content_size CHECK (octet_length(content) = byte_size),
  CONSTRAINT petition_template_version_fields CHECK (cardinality(field_keys) BETWEEN 1 AND 40)
);

CREATE INDEX petition_template_versions_family_idx
  ON petition_template_versions(template_id,version DESC);

CREATE TABLE petition_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  template_version_id uuid NOT NULL REFERENCES petition_template_versions(id) ON DELETE RESTRICT,
  title text NOT NULL,
  file_name text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 12582912),
  content bytea NOT NULL,
  preview_text text NOT NULL DEFAULT '',
  fields_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','sent')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT petition_document_title_length CHECK (length(btrim(title)) BETWEEN 2 AND 180),
  CONSTRAINT petition_document_filename_length CHECK (length(file_name) BETWEEN 1 AND 180),
  CONSTRAINT petition_document_content_size CHECK (octet_length(content) = byte_size)
);

CREATE INDEX petition_documents_project_time_idx
  ON petition_documents(project_id,updated_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX petition_documents_creator_time_idx
  ON petition_documents(created_by,updated_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX petition_documents_status_idx
  ON petition_documents(status,updated_at DESC)
  WHERE archived_at IS NULL;

CREATE TABLE petition_document_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES petition_documents(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('created','status_changed','downloaded','archived')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX petition_document_audit_time_idx
  ON petition_document_audit_events(document_id,created_at DESC);

CREATE FUNCTION prevent_petition_document_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'petition document audit events are append-only';
END;
$$;

CREATE TRIGGER petition_document_audit_events_append_only
BEFORE UPDATE OR DELETE ON petition_document_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_petition_document_audit_mutation();

-- The module opens only with the server-side DOCX template and document workflows.
UPDATE app_modules SET is_enabled = true WHERE module_key = 'petitions';

INSERT INTO role_module_permissions(role_id,module_key,permission_key)
SELECT r.id,d.module_key,d.permission_key
FROM (VALUES
  ('employee','petitions','view'),
  ('employee','petitions','create'),
  ('team_lead','petitions','view'),
  ('team_lead','petitions','create'),
  ('project_manager','petitions','view'),
  ('project_manager','petitions','create'),
  ('project_manager','petitions','update'),
  ('process_owner','petitions','view'),
  ('process_owner','petitions','create'),
  ('process_owner','petitions','update'),
  ('process_owner','petitions','delete'),
  ('process_owner','petitions','manage'),
  ('document_steward','petitions','view'),
  ('document_steward','petitions','create'),
  ('document_steward','petitions','update'),
  ('document_steward','petitions','delete'),
  ('document_steward','petitions','manage'),
  ('employee','petitions','update'),
  ('team_lead','petitions','update'),
  ('system_admin','petitions','view'),
  ('system_admin','petitions','create'),
  ('system_admin','petitions','update'),
  ('system_admin','petitions','delete'),
  ('system_admin','petitions','manage'),
  ('auditor','petitions','view')
) AS d(role_code,module_key,permission_key)
JOIN roles r ON r.code=d.role_code
ON CONFLICT DO NOTHING;
