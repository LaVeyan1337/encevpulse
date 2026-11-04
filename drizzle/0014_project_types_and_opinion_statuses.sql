ALTER TABLE projects
  ADD COLUMN project_type text NOT NULL DEFAULT 'other'
  CHECK (project_type IN ('res','ges','maden','yk_ges','storage','other'));

CREATE INDEX projects_type_status_idx
  ON projects(project_type,status)
  WHERE archived_at IS NULL;

ALTER TABLE ced_institution_opinions
  DROP CONSTRAINT IF EXISTS ced_institution_opinions_status_check;

ALTER TABLE ced_institution_opinions
  ADD CONSTRAINT ced_institution_opinions_status_check
  CHECK (status IN (
    'draft','requested','waiting','responded','revision_requested','closed',
    'positive','negative','revision','other_request'
  ));
