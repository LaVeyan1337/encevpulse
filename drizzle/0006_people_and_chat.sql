ALTER TABLE users
  ADD COLUMN job_title text NOT NULL DEFAULT '',
  ADD COLUMN department text NOT NULL DEFAULT '',
  ADD COLUMN avatar_key text NOT NULL DEFAULT 'cat';

UPDATE users
SET avatar_key = (ARRAY['cat','fox','panda','rabbit','owl','bear','koala','penguin','otter','deer','raccoon','tiger'])
  [1 + mod(abs(hashtext(id::text)::bigint), 12)::int];

ALTER TABLE users
  ADD CONSTRAINT users_job_title_length CHECK (length(job_title) <= 120),
  ADD CONSTRAINT users_department_length CHECK (length(department) <= 100),
  ADD CONSTRAINT users_avatar_key_check CHECK (
    avatar_key IN ('cat','fox','panda','rabbit','owl','bear','koala','penguin','otter','deer','raccoon','tiger')
  );

INSERT INTO roles (code, display_name) VALUES
  ('team_lead', 'Ekip Sorumlusu'),
  ('project_manager', 'Proje Yöneticisi'),
  ('process_owner', 'Süreç Sahibi'),
  ('document_steward', 'Belge Sorumlusu'),
  ('auditor', 'Denetçi')
ON CONFLICT (code) DO NOTHING;

CREATE INDEX users_department_active_idx
  ON users (department, display_name)
  WHERE status = 'active';

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_type text NOT NULL CHECK (conversation_type IN ('direct','group')),
  title text,
  direct_user_low uuid REFERENCES users(id) ON DELETE RESTRICT,
  direct_user_high uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT conversations_title_length CHECK (title IS NULL OR length(btrim(title)) BETWEEN 1 AND 100),
  CONSTRAINT conversations_direct_pair CHECK (
    (conversation_type = 'direct' AND direct_user_low IS NOT NULL AND direct_user_high IS NOT NULL
      AND direct_user_low < direct_user_high AND title IS NULL)
    OR
    (conversation_type = 'group' AND direct_user_low IS NULL AND direct_user_high IS NULL
      AND title IS NOT NULL)
  )
);

CREATE UNIQUE INDEX conversations_direct_pair_unique
  ON conversations (direct_user_low,direct_user_high)
  WHERE conversation_type = 'direct' AND archived_at IS NULL;

CREATE INDEX conversations_updated_idx ON conversations (updated_at DESC) WHERE archived_at IS NULL;

CREATE TABLE conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  member_role text NOT NULL DEFAULT 'member' CHECK (member_role IN ('owner','admin','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  PRIMARY KEY (conversation_id,user_id)
);

CREATE INDEX conversation_members_user_idx
  ON conversation_members (user_id,conversation_id) WHERE left_at IS NULL;

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  client_request_id uuid NOT NULL,
  body text NOT NULL,
  reply_to_id uuid REFERENCES messages(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  pinned_at timestamptz,
  pinned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT messages_body_length CHECK (
    (deleted_at IS NOT NULL AND body = '') OR
    (deleted_at IS NULL AND length(btrim(body)) BETWEEN 1 AND 4000)
  ),
  CONSTRAINT messages_pin_consistency CHECK (
    (pinned_at IS NULL AND pinned_by IS NULL) OR
    (pinned_at IS NOT NULL AND pinned_by IS NOT NULL)
  ),
  UNIQUE (sender_id,client_request_id)
);

CREATE INDEX messages_conversation_cursor_idx
  ON messages (conversation_id,created_at DESC,id DESC);

CREATE INDEX messages_sender_time_idx ON messages (sender_id,created_at DESC);

CREATE TABLE message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('created','edited','deleted','pinned','unpinned')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX message_events_message_time_idx ON message_events (message_id,created_at DESC);

CREATE FUNCTION prevent_message_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'message events are append-only';
END;
$$;

CREATE TRIGGER message_events_append_only
BEFORE UPDATE OR DELETE ON message_events
FOR EACH ROW EXECUTE FUNCTION prevent_message_event_mutation();

CREATE TABLE message_reactions (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reaction_code text NOT NULL CHECK (reaction_code IN ('👍','❤️','😂','🎉','👀','🙏','✅','🔥')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id,user_id,reaction_code)
);

CREATE INDEX message_reactions_message_idx ON message_reactions (message_id,created_at);

CREATE TABLE conversation_read_cursors (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  last_read_message_id uuid NOT NULL REFERENCES messages(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id,user_id)
);

CREATE TABLE message_task_links (
  message_id uuid PRIMARY KEY REFERENCES messages(id) ON DELETE RESTRICT,
  task_id uuid NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chat_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT chat_notifications_actor_recipient CHECK (actor_user_id <> recipient_user_id)
);

CREATE INDEX chat_notifications_unread_idx
  ON chat_notifications (recipient_user_id,created_at DESC)
  WHERE read_at IS NULL;
