INSERT INTO role_module_permissions(role_id,module_key,permission_key)
SELECT r.id,d.module_key,d.permission_key
FROM (VALUES
 ('employee','tasks','delete'),
 ('employee','projects','create'),
 ('employee','projects','update'),
 ('employee','projects','delete'),
 ('team_lead','tasks','delete'),
 ('team_lead','projects','create'),
 ('team_lead','projects','update'),
 ('team_lead','projects','delete'),
 ('project_manager','projects','delete'),
 ('system_admin','overview','view'),
 ('system_admin','tasks','view'),
 ('system_admin','projects','view'),
 ('system_admin','people','view'),
 ('system_admin','notifications','view'),
 ('system_admin','notifications','update')
) AS d(role_code,module_key,permission_key)
JOIN roles r ON r.code=d.role_code
ON CONFLICT DO NOTHING;

DELETE FROM role_module_permissions p
USING roles r
WHERE p.role_id=r.id AND r.code='system_admin'
  AND p.module_key IN ('users','permissions','settings')
  AND p.permission_key<>'manage';

-- The previous account-creation flow implicitly added employee to every selected role.
-- Remove that legacy implicit grant from multi-role accounts. Administrators can
-- explicitly assign employee again when it is genuinely intended.
DELETE FROM user_role_assignments employee_assignment
USING roles employee_role
WHERE employee_assignment.role_id=employee_role.id
  AND employee_role.code='employee'
  AND EXISTS (
    SELECT 1
    FROM user_role_assignments other_assignment
    JOIN roles other_role ON other_role.id=other_assignment.role_id
    WHERE other_assignment.user_id=employee_assignment.user_id
      AND other_role.code<>'employee'
  );
