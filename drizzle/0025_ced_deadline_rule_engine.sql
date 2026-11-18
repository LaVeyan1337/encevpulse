-- Versioned, human-approved deadline rules.
-- The migration does not calculate or rewrite any existing opinion deadline.
CREATE TABLE ced_deadline_rule_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  current_version_id uuid,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT ced_deadline_rule_name_length CHECK (length(btrim(name)) BETWEEN 2 AND 180),
  CONSTRAINT ced_deadline_rule_description_length CHECK (length(description) <= 1200)
);

CREATE UNIQUE INDEX ced_deadline_rule_active_name_idx
  ON ced_deadline_rule_families(lower(btrim(name)))
  WHERE is_active=true AND archived_at IS NULL;

CREATE TABLE ced_deadline_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES ced_deadline_rule_families(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  day_count integer NOT NULL CHECK (day_count BETWEEN 1 AND 3650),
  day_type text NOT NULL CHECK (day_type IN ('calendar_days','business_days')),
  start_event_label text NOT NULL CHECK (length(btrim(start_event_label)) BETWEEN 2 AND 240),
  include_start_day boolean NOT NULL DEFAULT false,
  due_date_adjustment text NOT NULL DEFAULT 'none'
    CHECK (due_date_adjustment IN ('none','next_business_day','previous_business_day')),
  weekend_days smallint[] NOT NULL DEFAULT ARRAY[]::smallint[],
  holiday_dates date[] NOT NULL DEFAULT ARRAY[]::date[],
  calendar_name text NOT NULL DEFAULT '',
  calendar_source_label text NOT NULL DEFAULT '',
  calendar_source_reference text NOT NULL DEFAULT '',
  calendar_verified_at date,
  legal_reference text NOT NULL,
  rule_source_label text NOT NULL,
  rule_source_reference text NOT NULL,
  rule_notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ced_deadline_rule_version_unique UNIQUE(rule_id,version),
  CONSTRAINT ced_deadline_rule_fields_length CHECK (
    length(btrim(legal_reference)) BETWEEN 3 AND 600 AND
    length(btrim(rule_source_label)) BETWEEN 2 AND 180 AND
    length(btrim(rule_source_reference)) BETWEEN 2 AND 1200 AND
    length(rule_notes) <= 3000 AND
    length(calendar_name) <= 180 AND
    length(calendar_source_label) <= 180 AND
    length(calendar_source_reference) <= 1200 AND
    cardinality(holiday_dates) <= 1200 AND
    cardinality(weekend_days) <= 7
  ),
  CONSTRAINT ced_deadline_rule_approval_shape CHECK (
    (status='draft' AND approved_by IS NULL AND approved_at IS NULL) OR
    (status='approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
  ),
  CONSTRAINT ced_deadline_rule_calendar_shape CHECK (
    (day_type='business_days' AND length(btrim(calendar_name))>=2 AND
      length(btrim(calendar_source_label))>=2 AND
      length(btrim(calendar_source_reference))>=2 AND calendar_verified_at IS NOT NULL AND
      cardinality(weekend_days)>=1) OR day_type='calendar_days'
  )
);

CREATE UNIQUE INDEX ced_deadline_rule_one_draft_idx
  ON ced_deadline_rule_versions(rule_id) WHERE status='draft';
CREATE INDEX ced_deadline_rule_versions_history_idx
  ON ced_deadline_rule_versions(rule_id,version DESC);

ALTER TABLE ced_deadline_rule_families
  ADD CONSTRAINT ced_deadline_rule_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES ced_deadline_rule_versions(id) ON DELETE RESTRICT;

CREATE FUNCTION prevent_approved_deadline_rule_mutation()
RETURNS trigger LANGUAGE plpgsql AS $deadline_rule_immutable$
BEGIN
  IF OLD.status='approved' THEN
    RAISE EXCEPTION 'approved deadline rule versions are immutable';
  END IF;
  IF TG_OP='DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$deadline_rule_immutable$;

CREATE TRIGGER ced_deadline_rule_versions_immutable
BEFORE UPDATE OR DELETE ON ced_deadline_rule_versions
FOR EACH ROW EXECUTE FUNCTION prevent_approved_deadline_rule_mutation();

CREATE TABLE ced_deadline_rule_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES ced_deadline_rule_families(id) ON DELETE RESTRICT,
  rule_version_id uuid REFERENCES ced_deadline_rule_versions(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('created','draft_updated','approved','archived')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ced_deadline_rule_audit_history_idx
  ON ced_deadline_rule_audit_events(rule_id,created_at DESC);

CREATE FUNCTION prevent_deadline_rule_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $deadline_rule_audit_immutable$
BEGIN
  RAISE EXCEPTION 'deadline rule audit events are append-only';
END;
$deadline_rule_audit_immutable$;

CREATE TRIGGER ced_deadline_rule_audit_events_append_only
BEFORE UPDATE OR DELETE ON ced_deadline_rule_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_deadline_rule_audit_mutation();

ALTER TABLE ced_institution_opinions
  ADD COLUMN deadline_basis text NOT NULL DEFAULT 'manual'
    CHECK (deadline_basis IN ('manual','rule_calculated')),
  ADD COLUMN deadline_rule_version_id uuid REFERENCES ced_deadline_rule_versions(id) ON DELETE RESTRICT,
  ADD COLUMN deadline_start_date date,
  ADD COLUMN deadline_start_event_label text NOT NULL DEFAULT '' CHECK (length(deadline_start_event_label) <= 240),
  ADD COLUMN deadline_calculated_at timestamptz,
  ADD COLUMN deadline_reason text NOT NULL DEFAULT '' CHECK (length(deadline_reason) <= 1000),
  ADD CONSTRAINT ced_opinion_deadline_basis_shape CHECK (
    (deadline_basis='manual' AND deadline_rule_version_id IS NULL AND
      deadline_start_date IS NULL AND deadline_start_event_label='' AND deadline_calculated_at IS NULL) OR
    (deadline_basis='rule_calculated' AND deadline_rule_version_id IS NOT NULL AND
      deadline_start_date IS NOT NULL AND length(btrim(deadline_start_event_label))>=2 AND deadline_calculated_at IS NOT NULL AND
      deadline_date IS NOT NULL)
  );

CREATE INDEX ced_opinion_deadline_rule_idx
  ON ced_institution_opinions(deadline_rule_version_id)
  WHERE deadline_rule_version_id IS NOT NULL;

CREATE TABLE ced_opinion_deadline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opinion_id uuid NOT NULL REFERENCES ced_institution_opinions(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('rule_applied','manual_set','manual_override','cleared')),
  old_deadline_date date,
  new_deadline_date date,
  old_rule_version_id uuid REFERENCES ced_deadline_rule_versions(id) ON DELETE RESTRICT,
  new_rule_version_id uuid REFERENCES ced_deadline_rule_versions(id) ON DELETE RESTRICT,
  start_date date,
  start_event_label text NOT NULL DEFAULT '' CHECK (length(start_event_label) <= 240),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 1000),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ced_opinion_deadline_events_history_idx
  ON ced_opinion_deadline_events(opinion_id,created_at DESC);

CREATE FUNCTION prevent_opinion_deadline_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $opinion_deadline_immutable$
BEGIN
  RAISE EXCEPTION 'opinion deadline events are append-only';
END;
$opinion_deadline_immutable$;

CREATE TRIGGER ced_opinion_deadline_events_append_only
BEFORE UPDATE OR DELETE ON ced_opinion_deadline_events
FOR EACH ROW EXECUTE FUNCTION prevent_opinion_deadline_event_mutation();

INSERT INTO role_module_permissions(role_id,module_key,permission_key)
SELECT id,'institution_opinions','manage'
FROM roles
WHERE code='process_owner'
ON CONFLICT DO NOTHING;
