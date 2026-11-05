-- Structured contact records are captured from real institution-opinion correspondence.
-- Contacts are shared directory entries; visibility is inherited from accessible linked projects.
CREATE TABLE ced_institution_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_name text NOT NULL,
  contact_person text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT ced_institution_contacts_institution_length CHECK (length(btrim(institution_name)) BETWEEN 2 AND 180),
  CONSTRAINT ced_institution_contacts_person_length CHECK (length(contact_person) <= 160),
  CONSTRAINT ced_institution_contacts_title_length CHECK (length(title) <= 120),
  CONSTRAINT ced_institution_contacts_department_length CHECK (length(department) <= 120),
  CONSTRAINT ced_institution_contacts_phone_length CHECK (length(phone) <= 60),
  CONSTRAINT ced_institution_contacts_email_length CHECK (length(email) <= 254),
  CONSTRAINT ced_institution_contacts_address_length CHECK (length(address) <= 400)
);

CREATE INDEX ced_institution_contacts_lookup_idx
  ON ced_institution_contacts (lower(institution_name), lower(contact_person), lower(email))
  WHERE archived_at IS NULL;

ALTER TABLE ced_institution_opinions
  ADD COLUMN contact_id uuid REFERENCES ced_institution_contacts(id) ON DELETE RESTRICT;

CREATE INDEX ced_institution_opinions_contact_idx
  ON ced_institution_opinions(contact_id)
  WHERE contact_id IS NOT NULL AND archived_at IS NULL;

-- Project leads and process owners can remove irrelevant draft/request entries.
INSERT INTO role_module_permissions(role_id,module_key,permission_key)
SELECT r.id,'institution_opinions','delete'
FROM roles r
WHERE r.code IN ('project_manager','process_owner')
ON CONFLICT DO NOTHING;
