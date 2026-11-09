-- Task files are stored in PULSE PostgreSQL. No filesystem, SMB, or NAS path is used.
CREATE TABLE task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  sha256 char(64) NOT NULL,
  content bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT task_attachments_name_length CHECK (length(btrim(original_name)) BETWEEN 1 AND 180),
  CONSTRAINT task_attachments_size_limit CHECK (byte_size BETWEEN 1 AND 12582912),
  CONSTRAINT task_attachments_mime_allowlist CHECK (mime_type IN (
    'image/jpeg','image/png','image/webp','image/gif','application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv','audio/webm','video/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav','video/mp4'
  )),
  CONSTRAINT task_attachments_content_retention CHECK (
    (deleted_at IS NULL AND content IS NOT NULL) OR (deleted_at IS NOT NULL AND content IS NULL)
  )
);

CREATE INDEX task_attachments_task_idx
  ON task_attachments(task_id,created_at,id)
  WHERE deleted_at IS NULL;

CREATE INDEX task_attachments_uploaded_by_idx
  ON task_attachments(uploaded_by,created_at DESC)
  WHERE deleted_at IS NULL;
