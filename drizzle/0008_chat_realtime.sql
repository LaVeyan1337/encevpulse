-- Content-free transactional notifications for authenticated chat SSE streams.
CREATE FUNCTION publish_chat_realtime_event() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_conversation_id uuid;
  v_message_id uuid;
  v_affected_user_id uuid;
  v_event_type text;
BEGIN
  IF TG_TABLE_NAME IN ('messages','conversation_members','conversation_read_cursors') THEN
    IF TG_OP='DELETE' THEN
      v_conversation_id:=OLD.conversation_id;
    ELSE
      v_conversation_id:=NEW.conversation_id;
    END IF;
  ELSE
    IF TG_OP='DELETE' THEN
      v_message_id:=OLD.message_id;
    ELSE
      v_message_id:=NEW.message_id;
    END IF;
    SELECT conversation_id INTO v_conversation_id FROM messages WHERE id=v_message_id;
  END IF;

  IF TG_TABLE_NAME='messages' THEN
    v_event_type:='message.changed';
  ELSIF TG_TABLE_NAME='conversation_members' THEN
    v_event_type:='membership.changed';
    IF TG_OP='DELETE' THEN v_affected_user_id:=OLD.user_id;
    ELSE v_affected_user_id:=NEW.user_id;
    END IF;
  ELSIF TG_TABLE_NAME='message_reactions' THEN
    v_event_type:='reaction.changed';
  ELSIF TG_TABLE_NAME='conversation_read_cursors' THEN
    v_event_type:='read.changed';
  ELSIF TG_TABLE_NAME='message_task_links' THEN
    v_event_type:='task.linked';
  END IF;

  IF v_conversation_id IS NOT NULL THEN
    PERFORM pg_notify('pulse_chat_events',json_build_object(
      'conversationId',v_conversation_id,
      'eventType',v_event_type,
      'affectedUserId',v_affected_user_id
    )::text);
  END IF;

  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_publish_chat_event
AFTER INSERT OR UPDATE ON messages
FOR EACH ROW EXECUTE FUNCTION publish_chat_realtime_event();

CREATE TRIGGER conversation_members_publish_chat_event
AFTER INSERT OR UPDATE OR DELETE ON conversation_members
FOR EACH ROW EXECUTE FUNCTION publish_chat_realtime_event();

CREATE TRIGGER reactions_publish_chat_event
AFTER INSERT OR DELETE ON message_reactions
FOR EACH ROW EXECUTE FUNCTION publish_chat_realtime_event();

CREATE TRIGGER read_cursors_publish_chat_event
AFTER INSERT OR UPDATE OF last_read_message_id ON conversation_read_cursors
FOR EACH ROW EXECUTE FUNCTION publish_chat_realtime_event();

CREATE TRIGGER message_task_links_publish_chat_event
AFTER INSERT ON message_task_links
FOR EACH ROW EXECUTE FUNCTION publish_chat_realtime_event();
