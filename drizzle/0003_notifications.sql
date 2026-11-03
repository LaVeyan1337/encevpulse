CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('task.assigned')),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT notifications_actor_recipient CHECK (actor_user_id IS NULL OR actor_user_id <> recipient_user_id)
);

CREATE INDEX notifications_recipient_unread_idx ON notifications (recipient_user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX notifications_recipient_recent_idx ON notifications (recipient_user_id, created_at DESC);
