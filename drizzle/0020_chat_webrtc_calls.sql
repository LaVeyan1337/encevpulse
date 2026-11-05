CREATE TABLE chat_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  caller_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  callee_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  media_type text NOT NULL CHECK (media_type IN ('audio','video')),
  status text NOT NULL DEFAULT 'ringing'
    CHECK (status IN ('ringing','accepted','declined','ended','missed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '45 seconds'),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  ended_at timestamptz,
  CONSTRAINT chat_calls_distinct_participants CHECK (caller_user_id<>callee_user_id),
  CONSTRAINT chat_calls_state_timestamps CHECK (
    (status='ringing' AND accepted_at IS NULL AND ended_at IS NULL) OR
    (status='accepted' AND accepted_at IS NOT NULL AND ended_at IS NULL) OR
    (status IN ('declined','ended','missed','cancelled') AND ended_at IS NOT NULL)
  )
);

CREATE INDEX chat_calls_conversation_created_idx
  ON chat_calls(conversation_id,created_at DESC);

CREATE INDEX chat_calls_caller_active_idx
  ON chat_calls(caller_user_id,created_at DESC)
  WHERE status IN ('ringing','accepted');

CREATE INDEX chat_calls_callee_active_idx
  ON chat_calls(callee_user_id,created_at DESC)
  WHERE status IN ('ringing','accepted');

CREATE TABLE chat_call_signals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  call_id uuid NOT NULL REFERENCES chat_calls(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  signal_type text NOT NULL CHECK (signal_type IN ('offer','answer','ice_candidate')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_call_signals_payload_size CHECK (octet_length(payload::text)<=20000)
);

CREATE INDEX chat_call_signals_cursor_idx
  ON chat_call_signals(call_id,id);

CREATE FUNCTION publish_chat_call_realtime_event() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_conversation_id uuid;
BEGIN
  IF TG_OP='DELETE' THEN
    v_conversation_id:=OLD.conversation_id;
  ELSE
    v_conversation_id:=NEW.conversation_id;
  END IF;
  IF v_conversation_id IS NOT NULL THEN
    PERFORM pg_notify('pulse_chat_events',json_build_object(
      'conversationId',v_conversation_id,
      'eventType','call.changed',
      'affectedUserId',NULL
    )::text);
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_calls_publish_event
AFTER INSERT OR UPDATE ON chat_calls
FOR EACH ROW EXECUTE FUNCTION publish_chat_call_realtime_event();

CREATE TRIGGER chat_call_signals_publish_event
AFTER INSERT ON chat_call_signals
FOR EACH ROW EXECUTE FUNCTION publish_chat_call_realtime_event();
