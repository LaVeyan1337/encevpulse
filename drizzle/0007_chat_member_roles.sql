CREATE TABLE conversation_member_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('added','removed','role_changed')),
  previous_role text CHECK (previous_role IS NULL OR previous_role IN ('owner','admin','member')),
  next_role text CHECK (next_role IS NULL OR next_role IN ('owner','admin','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_member_event_roles CHECK (
    (event_type='added' AND previous_role IS NULL AND next_role IS NOT NULL)
    OR (event_type='removed' AND previous_role IS NOT NULL AND next_role IS NULL)
    OR (event_type='role_changed' AND previous_role IS NOT NULL AND next_role IS NOT NULL AND previous_role<>next_role)
  )
);

CREATE INDEX conversation_member_events_history_idx
  ON conversation_member_events(conversation_id,created_at DESC);

CREATE FUNCTION prevent_conversation_member_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'conversation member events are append-only';
END;
$$;

CREATE TRIGGER conversation_member_events_append_only
BEFORE UPDATE OR DELETE ON conversation_member_events
FOR EACH ROW EXECUTE FUNCTION prevent_conversation_member_event_mutation();
