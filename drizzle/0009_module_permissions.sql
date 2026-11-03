CREATE TABLE app_modules (
  module_key text PRIMARY KEY,
  display_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  CONSTRAINT app_modules_key_format CHECK (module_key ~ '^[a-z][a-z0-9_]{1,48}$')
);

INSERT INTO app_modules(module_key,display_name,is_enabled,sort_order) VALUES
  ('overview','Genel Bakış',true,10),
  ('tasks','Görevler & Süreç',true,20),
  ('projects','Projeler',true,30),
  ('calendar','Takvim & Yasal Süreçler',false,40),
  ('chat','Sohbet',true,50),
  ('people','Çalışan Rehberi',true,60),
  ('drive','Belgeler / Ortak Drive',false,70),
  ('institution_guide','Kurum Rehberi',false,80),
  ('institution_opinions','Kurum Görüşleri',false,90),
  ('petitions','Dilekçeler',false,100),
  ('eced','e-ÇED Takip',false,110),
  ('notes','Notlarım',false,120),
  ('notifications','Bildirimler',true,130),
  ('users','Kullanıcı Yönetimi',true,140),
  ('settings','Sistem Ayarları',false,150),
  ('permissions','Rol ve İzin Yönetimi',true,160);

CREATE TABLE role_module_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  module_key text NOT NULL REFERENCES app_modules(module_key) ON DELETE RESTRICT,
  permission_key text NOT NULL CHECK (permission_key IN ('view','create','update','delete','manage')),
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(role_id,module_key,permission_key)
);

CREATE INDEX role_module_permissions_module_idx
  ON role_module_permissions(module_key,role_id);

-- Defaults preserve current employee workflows. These are role-level module
-- permissions only; task/project/conversation record scopes remain enforced
-- by their existing service queries and membership checks.
WITH defaults(role_code,module_key,permission_key) AS (
  VALUES
    ('employee','overview','view'),
    ('employee','tasks','view'),('employee','tasks','create'),('employee','tasks','update'),
    ('employee','projects','view'),
    ('employee','people','view'),
    ('employee','chat','view'),('employee','chat','create'),('employee','chat','update'),('employee','chat','delete'),
    ('employee','notifications','view'),('employee','notifications','update'),

    ('team_lead','overview','view'),
    ('team_lead','tasks','view'),('team_lead','tasks','create'),('team_lead','tasks','update'),
    ('team_lead','projects','view'),('team_lead','people','view'),
    ('team_lead','chat','view'),('team_lead','chat','create'),('team_lead','chat','update'),('team_lead','chat','delete'),
    ('team_lead','notifications','view'),('team_lead','notifications','update'),
    ('team_lead','calendar','view'),

    ('project_manager','overview','view'),
    ('project_manager','tasks','view'),('project_manager','tasks','create'),('project_manager','tasks','update'),
    ('project_manager','projects','view'),('project_manager','projects','create'),('project_manager','projects','update'),
    ('project_manager','people','view'),
    ('project_manager','chat','view'),('project_manager','chat','create'),('project_manager','chat','update'),('project_manager','chat','delete'),
    ('project_manager','notifications','view'),('project_manager','notifications','update'),
    ('project_manager','calendar','view'),('project_manager','calendar','create'),('project_manager','calendar','update'),

    ('process_owner','overview','view'),
    ('process_owner','tasks','view'),('process_owner','tasks','create'),('process_owner','tasks','update'),
    ('process_owner','projects','view'),('process_owner','people','view'),
    ('process_owner','chat','view'),('process_owner','chat','create'),('process_owner','chat','update'),
    ('process_owner','notifications','view'),('process_owner','notifications','update'),
    ('process_owner','calendar','view'),('process_owner','calendar','create'),('process_owner','calendar','update'),
    ('process_owner','institution_opinions','view'),('process_owner','institution_opinions','create'),('process_owner','institution_opinions','update'),
    ('process_owner','eced','view'),('process_owner','eced','create'),('process_owner','eced','update'),
    ('process_owner','petitions','view'),('process_owner','petitions','create'),('process_owner','petitions','update'),

    ('document_steward','overview','view'),
    ('document_steward','tasks','view'),('document_steward','projects','view'),('document_steward','people','view'),
    ('document_steward','chat','view'),('document_steward','notifications','view'),
    ('document_steward','drive','view'),('document_steward','drive','create'),('document_steward','drive','update'),
    ('document_steward','institution_guide','view'),('document_steward','institution_guide','update'),

    ('auditor','overview','view'),
    ('auditor','tasks','view'),('auditor','projects','view'),('auditor','people','view'),
    ('auditor','calendar','view'),('auditor','drive','view'),('auditor','institution_guide','view'),
    ('auditor','institution_opinions','view'),('auditor','petitions','view'),('auditor','eced','view'),
    ('auditor','notifications','view'),

    ('system_admin','users','view'),('system_admin','users','create'),('system_admin','users','update'),
    ('system_admin','users','delete'),('system_admin','users','manage'),
    ('system_admin','settings','view'),('system_admin','settings','manage'),
    ('system_admin','permissions','view'),('system_admin','permissions','manage')
)
INSERT INTO role_module_permissions(role_id,module_key,permission_key)
SELECT r.id,d.module_key,d.permission_key
FROM defaults d JOIN roles r ON r.code=d.role_code
ON CONFLICT DO NOTHING;
