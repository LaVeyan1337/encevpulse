-- These two modules do not yet meet their documented acceptance criteria.
-- Preserve their existing data and permissions; only remove them from user navigation/API access.
-- Institution contacts remain readable inside the project-scoped Institution Opinions workflow.
UPDATE app_modules
SET is_enabled = false
WHERE module_key IN ('institution_guide','petitions');
