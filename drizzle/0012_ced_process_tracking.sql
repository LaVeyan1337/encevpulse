-- Project-scoped ÇED process, institution opinion and İDK tracking.
-- Stage deadlines are entered by users; no statutory deadline is inferred here.
UPDATE app_modules SET is_enabled = true
WHERE module_key IN ('eced','institution_opinions');

INSERT INTO role_module_permissions(role_id,module_key,permission_key)
SELECT r.id,d.module_key,d.permission_key
FROM roles r
JOIN (VALUES
  ('process_owner','eced','view'),
  ('process_owner','eced','create'),
  ('process_owner','eced','update'),
  ('process_owner','institution_opinions','view'),
  ('process_owner','institution_opinions','create'),
  ('process_owner','institution_opinions','update'),
  ('project_manager','eced','view'),
  ('project_manager','institution_opinions','view')
) AS d(role_code,module_key,permission_key) ON d.role_code=r.code
ON CONFLICT DO NOTHING;

CREATE TABLE ced_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE RESTRICT,
  route_code text NOT NULL CHECK (route_code IN ('ek1_cbd','ek2_ptd','combined','custom')),
  decision text NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending','ced_positive','ced_report_required','ced_negative','outside_scope','withdrawn')),
  file_number text NOT NULL DEFAULT '' CHECK (length(file_number) <= 120),
  eced_reference text NOT NULL DEFAULT '' CHECK (length(eced_reference) <= 160),
  started_on date,
  closed_on date,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 6000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT ced_case_date_order CHECK (started_on IS NULL OR closed_on IS NULL OR started_on <= closed_on)
);

CREATE INDEX ced_cases_project_active_idx ON ced_cases(project_id) WHERE archived_at IS NULL;
CREATE INDEX ced_cases_decision_idx ON ced_cases(decision,updated_at DESC) WHERE archived_at IS NULL;

CREATE TABLE ced_case_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES ced_cases(id) ON DELETE RESTRICT,
  stage_key text NOT NULL CHECK (length(stage_key) BETWEEN 2 AND 80),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 180),
  sort_order integer NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 10000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','waiting','completed','not_applicable','revision_requested')),
  required_document_type text CHECK (required_document_type IN ('cbd','ptd','ced_report','final_report','last_final_report')),
  is_milestone boolean NOT NULL DEFAULT false,
  is_custom boolean NOT NULL DEFAULT false,
  due_on date,
  completed_at timestamptz,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 3000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT ced_stage_key_per_case UNIQUE(case_id,stage_key),
  CONSTRAINT ced_stage_completion_shape CHECK (
    (status='completed' AND completed_at IS NOT NULL) OR
    (status<>'completed' AND completed_at IS NULL)
  )
);

CREATE INDEX ced_case_stages_timeline_idx ON ced_case_stages(case_id,sort_order,created_at)
WHERE archived_at IS NULL;
CREATE INDEX ced_case_stages_due_idx ON ced_case_stages(due_on)
WHERE archived_at IS NULL AND due_on IS NOT NULL AND status NOT IN ('completed','not_applicable');

CREATE TABLE ced_idk_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES ced_cases(id) ON DELETE RESTRICT,
  meeting_type text NOT NULL DEFAULT 'idk' CHECK (meeting_type IN ('idk','preliminary','other')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 180),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  location text NOT NULL DEFAULT '' CHECK (length(location) <= 240),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','held','postponed','cancelled')),
  agenda text NOT NULL DEFAULT '' CHECK (length(agenda) <= 5000),
  decisions text NOT NULL DEFAULT '' CHECK (length(decisions) <= 5000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT ced_idk_time_order CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX ced_idk_meetings_case_date_idx ON ced_idk_meetings(case_id,starts_at) WHERE archived_at IS NULL;

CREATE TABLE ced_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES ced_cases(id) ON DELETE RESTRICT,
  stage_id uuid REFERENCES ced_case_stages(id) ON DELETE RESTRICT,
  meeting_id uuid REFERENCES ced_idk_meetings(id) ON DELETE RESTRICT,
  document_type text NOT NULL CHECK (document_type IN ('cbd','ptd','ced_report','final_report','last_final_report','institution_opinion','idk_minutes','other')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 200),
  source_type text NOT NULL CHECK (source_type IN ('network_path','external_url','eced_reference','other')),
  source_reference text NOT NULL CHECK (length(btrim(source_reference)) BETWEEN 1 AND 1200),
  version_label text NOT NULL DEFAULT '' CHECK (length(version_label) <= 80),
  document_date date,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 3000),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT ced_document_stage_or_meeting CHECK (stage_id IS NULL OR meeting_id IS NULL)
);
CREATE INDEX ced_documents_case_time_idx ON ced_documents(case_id,created_at DESC) WHERE archived_at IS NULL;

CREATE TABLE ced_institution_opinions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES ced_cases(id) ON DELETE RESTRICT,
  institution_name text NOT NULL CHECK (length(btrim(institution_name)) BETWEEN 2 AND 180),
  subject text NOT NULL CHECK (length(btrim(subject)) BETWEEN 2 AND 240),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','requested','waiting','responded','revision_requested','closed')),
  request_date date,
  deadline_date date,
  response_date date,
  outgoing_letter_no text NOT NULL DEFAULT '' CHECK (length(outgoing_letter_no) <= 100),
  incoming_letter_no text NOT NULL DEFAULT '' CHECK (length(incoming_letter_no) <= 100),
  contact_person text NOT NULL DEFAULT '' CHECK (length(contact_person) <= 160),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT ced_opinion_date_order CHECK (
    (request_date IS NULL OR deadline_date IS NULL OR request_date <= deadline_date) AND
    (request_date IS NULL OR response_date IS NULL OR request_date <= response_date)
  )
);
CREATE INDEX ced_institution_opinions_due_idx ON ced_institution_opinions(deadline_date,status)
WHERE archived_at IS NULL AND deadline_date IS NOT NULL;

CREATE TABLE ced_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES ced_cases(id) ON DELETE RESTRICT,
  entity_type text NOT NULL CHECK (entity_type IN ('case','stage','document','institution_opinion','idk_meeting')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (length(btrim(action)) BETWEEN 2 AND 80),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ced_audit_case_time_idx ON ced_audit_events(case_id,occurred_at DESC);

CREATE FUNCTION prevent_ced_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ÇED audit events are append-only';
END;
$$;
CREATE TRIGGER ced_audit_events_append_only BEFORE UPDATE OR DELETE ON ced_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_ced_audit_mutation();
