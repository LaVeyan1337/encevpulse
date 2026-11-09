-- Explicit task-scoped followers. This grant does not expose project workspaces or files.
CREATE TABLE task_followers (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  added_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id),
  CONSTRAINT task_followers_not_self CHECK (user_id <> added_by)
);

CREATE INDEX task_followers_user_task_idx ON task_followers(user_id, task_id);

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_event_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_event_type_check
  CHECK (event_type IN ('task.assigned', 'task.comment', 'task.followed', 'task.updated'));
