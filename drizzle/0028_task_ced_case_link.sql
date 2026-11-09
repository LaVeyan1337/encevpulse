-- Tasks may reference only the process attached to the same project.
CREATE UNIQUE INDEX ced_cases_id_project_uidx ON ced_cases(id,project_id);

ALTER TABLE tasks
  ADD COLUMN ced_case_id uuid,
  ADD CONSTRAINT tasks_ced_case_requires_project
    CHECK (ced_case_id IS NULL OR project_id IS NOT NULL),
  ADD CONSTRAINT tasks_ced_case_same_project_fk
    FOREIGN KEY (ced_case_id,project_id)
    REFERENCES ced_cases(id,project_id)
    ON DELETE RESTRICT;

CREATE INDEX tasks_ced_case_idx ON tasks(ced_case_id) WHERE ced_case_id IS NOT NULL;
