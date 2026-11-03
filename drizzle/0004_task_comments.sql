-- Task comments are first-class task records. Deleted bodies are scrubbed while
-- append-only event metadata preserves who performed the lifecycle action.
CREATE TABLE task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  author_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT task_comments_body_length CHECK (
    (deleted_at IS NOT NULL AND body = '') OR
    (deleted_at IS NULL AND length(btrim(body)) BETWEEN 1 AND 4000)
  )
);

CREATE INDEX task_comments_task_time_idx
  ON task_comments (task_id, created_at, id)
  WHERE deleted_at IS NULL;

CREATE TABLE task_comment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  comment_id uuid NOT NULL REFERENCES task_comments(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'edited', 'deleted')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX task_comment_events_comment_time_idx
  ON task_comment_events (comment_id, occurred_at DESC);

CREATE FUNCTION prevent_task_comment_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'task comment events are append-only';
END;
$$;

CREATE TRIGGER task_comment_events_append_only
BEFORE UPDATE OR DELETE ON task_comment_events
FOR EACH ROW EXECUTE FUNCTION prevent_task_comment_event_mutation();

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_event_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_event_type_check
  CHECK (event_type IN ('task.assigned', 'task.comment'));
