-- Keep institution opinions attached to projects independently of whether a formal ÇED process exists.
-- Existing opinion rows keep their original case_id; no cases or audit records are deleted.
ALTER TABLE ced_institution_opinions
  ADD COLUMN project_id uuid;

UPDATE ced_institution_opinions o
SET project_id = c.project_id
FROM ced_cases c
WHERE c.id = o.case_id
  AND o.project_id IS NULL;

ALTER TABLE ced_institution_opinions
  ALTER COLUMN project_id SET NOT NULL,
  ALTER COLUMN case_id DROP NOT NULL;

ALTER TABLE ced_institution_opinions
  ADD CONSTRAINT ced_institution_opinions_project_fk
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

CREATE INDEX ced_institution_opinions_project_due_idx
  ON ced_institution_opinions(project_id,deadline_date,status)
  WHERE archived_at IS NULL;

-- The audit trail must also support project-scoped events before a case is created.
ALTER TABLE ced_audit_events
  ADD COLUMN project_id uuid;

-- Temporarily disable only the append-only guard to backfill the new foreign key value.
ALTER TABLE ced_audit_events DISABLE TRIGGER ced_audit_events_append_only;
UPDATE ced_audit_events a
SET project_id = c.project_id
FROM ced_cases c
WHERE c.id = a.case_id
  AND a.project_id IS NULL;
ALTER TABLE ced_audit_events ENABLE TRIGGER ced_audit_events_append_only;

ALTER TABLE ced_audit_events
  ALTER COLUMN project_id SET NOT NULL,
  ALTER COLUMN case_id DROP NOT NULL;

ALTER TABLE ced_audit_events
  ADD CONSTRAINT ced_audit_events_project_fk
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

CREATE INDEX ced_audit_project_time_idx
  ON ced_audit_events(project_id,occurred_at DESC);

-- Defer untouched downstream stages of existing Ek-2 cases until the PTD outcome.
-- In-progress/completed records are preserved; the migration never erases recorded work.
WITH adjusted AS (
  UPDATE ced_case_stages s
  SET status='not_applicable',completed_at=NULL,updated_at=now(),version=version+1
  FROM ced_cases c
  WHERE s.case_id=c.id
    AND c.route_code='ek2_ptd'
    AND c.decision<>'ced_report_required'
    AND (s.sort_order>45 OR s.is_custom=true)
    AND s.status='pending'
  RETURNING s.case_id,s.stage_key
), grouped AS (
  SELECT case_id,jsonb_agg(stage_key ORDER BY stage_key) AS stage_keys
  FROM adjusted
  GROUP BY case_id
)
INSERT INTO ced_audit_events(case_id,project_id,entity_type,entity_id,action,details,actor_user_id)
SELECT c.id,c.project_id,'case',c.id,'ptd_stages_deferred',
       jsonb_build_object('stageKeys',g.stage_keys,'reason','route_rule_migration'),NULL
FROM grouped g
JOIN ced_cases c ON c.id=g.case_id;


-- Legacy empty cases created only to hold institution opinions are retained and promoted
-- in place when the user creates the real project process.
ALTER TABLE ced_cases
  ADD COLUMN case_origin text NOT NULL DEFAULT 'process'
  CHECK (case_origin IN ('process','opinion_workspace'));

UPDATE ced_cases c
SET case_origin = 'opinion_workspace'
WHERE EXISTS (
  SELECT 1
  FROM ced_audit_events a
  WHERE a.case_id = c.id
    AND a.entity_type = 'case'
    AND a.action = 'created'
    AND a.details->>'source' = 'institution_opinion_workspace'
);
