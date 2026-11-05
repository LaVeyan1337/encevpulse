CREATE TABLE chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  sha256 char(64) NOT NULL,
  content bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT chat_attachments_name_length CHECK (length(btrim(original_name)) BETWEEN 1 AND 180),
  CONSTRAINT chat_attachments_size_limit CHECK (byte_size BETWEEN 1 AND 12582912),
  CONSTRAINT chat_attachments_mime_allowlist CHECK (mime_type IN (
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv',
    'audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav',
    'video/webm','video/mp4'
  )),
  CONSTRAINT chat_attachments_content_retention CHECK (
    (deleted_at IS NULL AND content IS NOT NULL) OR
    (deleted_at IS NOT NULL AND content IS NULL)
  )
);

CREATE INDEX chat_attachments_message_idx
  ON chat_attachments(message_id,created_at,id)
  WHERE deleted_at IS NULL;

CREATE INDEX chat_attachments_conversation_idx
  ON chat_attachments(conversation_id,created_at DESC)
  WHERE deleted_at IS NULL;
