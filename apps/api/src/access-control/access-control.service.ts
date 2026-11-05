import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { AuthUser } from '../auth/auth.service.js';
export const MODULE_ACTIONS = ['view','create','update','delete','manage'] as const;
export type ModuleAction = typeof MODULE_ACTIONS[number];
const MODULE_KEY = /^[a-z][a-z0-9_]{1,48}$/;

@Injectable()
export class AccessControlService {
  constructor(@Inject(DatabaseService) private readonly db:DatabaseService) {}
  async assertPermission(user:AuthUser,moduleKey:string,action:ModuleAction):Promise<void> {
    if(!MODULE_KEY.test(moduleKey)||!MODULE_ACTIONS.includes(action)) throw new ForbiddenException({code:'MODULE_PERMISSION_DENIED',message:'Bu modüle erişim yetkiniz bulunmuyor.'});
    if(user.roles.includes('system_admin')) {
      const moduleState=await this.db.query<{enabled:boolean}>(
        'SELECT is_enabled AS enabled FROM app_modules WHERE module_key=$1',[moduleKey],
      );
      if(moduleState.rows[0]?.enabled) return;
    }
    const result=await this.db.query<{allowed:boolean}>(
      `SELECT EXISTS(
         SELECT 1 FROM user_role_assignments ura
         JOIN roles r ON r.id=ura.role_id
         JOIN role_module_permissions p ON p.role_id=r.id
         JOIN app_modules m ON m.module_key=p.module_key
         WHERE ura.user_id=$1 AND r.code=ANY(string_to_array($2,','))
           AND p.module_key=$3 AND m.is_enabled=true
           AND p.permission_key IN ($4,'manage')
       ) AS allowed`,
      [user.id,user.roles.join(','),moduleKey,action],
    );
    if(!result.rows[0]?.allowed) throw new ForbiddenException({
      code:'MODULE_PERMISSION_DENIED',message:'Bu işlem için modül yetkiniz bulunmuyor.',module:moduleKey,action,
    });
  }

  async hasPermission(user:AuthUser,moduleKey:string,action:ModuleAction):Promise<boolean> {
    try {
      await this.assertPermission(user,moduleKey,action);
      return true;
    } catch(error) {
      if(error instanceof ForbiddenException)return false;
      throw error;
    }
  }

  async permissionsForUser(roleCodes:string[]) {
    const result=await this.db.query<{
      moduleKey:string;displayName:string;enabled:boolean;actions:string[];
    }>(
      `SELECT m.module_key AS "moduleKey",m.display_name AS "displayName",m.is_enabled AS enabled,
         COALESCE(array_agg(DISTINCT p.permission_key) FILTER (WHERE p.permission_key IS NOT NULL),ARRAY[]::text[]) AS actions
       FROM app_modules m
       LEFT JOIN role_module_permissions p ON p.module_key=m.module_key
         AND p.role_id IN (SELECT id FROM roles WHERE code=ANY(string_to_array($1,',')))
       GROUP BY m.module_key,m.display_name,m.is_enabled,m.sort_order
       ORDER BY m.sort_order,m.display_name`,
      [roleCodes.join(',')],
    );
    const modules=result.rows.map(row=>{
      const actions=new Set(row.actions);
      if(roleCodes.includes('system_admin')&&row.enabled) {
        for(const action of MODULE_ACTIONS) actions.add(action);
      }
      return {...row,actions:[...actions]};
    });
    return {modules};
  }

  async listMatrix() {
    const [roles,modules,grants]=await Promise.all([
      this.db.query<{code:string;displayName:string}>(
        `SELECT code,display_name AS "displayName" FROM roles
         ORDER BY CASE code WHEN 'employee' THEN 0 WHEN 'team_lead' THEN 1 WHEN 'project_manager' THEN 2
           WHEN 'process_owner' THEN 3 WHEN 'document_steward' THEN 4 WHEN 'auditor' THEN 5 ELSE 9 END,display_name`,
      ),
      this.db.query<{moduleKey:string;displayName:string;enabled:boolean;sortOrder:number}>(
        `SELECT module_key AS "moduleKey",display_name AS "displayName",
          is_enabled AS enabled,sort_order AS "sortOrder"
         FROM app_modules ORDER BY sort_order,display_name`,
      ),
      this.db.query<{roleCode:string;moduleKey:string;actions:string[]}>(
        `SELECT r.code AS "roleCode",p.module_key AS "moduleKey",
          array_agg(p.permission_key ORDER BY p.permission_key) AS actions
         FROM role_module_permissions p JOIN roles r ON r.id=p.role_id
         GROUP BY r.code,p.module_key`,
      ),
    ]);
    const grantsByKey=new Map(grants.rows.map(row=>[`${row.roleCode}:${row.moduleKey}`,row.actions]));
    return {
      roles:roles.rows,
      modules:modules.rows.map(module=>({
        ...module,
        permissionsByRole:Object.fromEntries(roles.rows.map(role=>[
          role.code,grantsByKey.get(`${role.code}:${module.moduleKey}`)??[],
        ])),
      })),
      actions:MODULE_ACTIONS,
    };
  }

  async setModuleEnabled(actor:AuthUser,moduleKey:string,input:unknown) {
    if(!MODULE_KEY.test(moduleKey)) throw new BadRequestException({code:'INVALID_MODULE_KEY',message:'Modül tanımı geçersiz.'});
    if(!input||typeof input!=='object'||Array.isArray(input)) throw new BadRequestException({code:'INVALID_MODULE_STATE',message:'Modül durumu geçersiz.'});
    const value=input as Record<string,unknown>;
    if(Object.keys(value).length!==1||typeof value.enabled!=='boolean') {
      throw new BadRequestException({code:'INVALID_MODULE_STATE',message:'Modül durumu geçersiz.'});
    }
    const enabled=value.enabled;
    const lockedOff=['drive','petitions','institution_guide'];
    if(enabled&&lockedOff.includes(moduleKey)) {
      const messages:Record<string,string>={
        drive:'Ortak Drive, şirket dosya alanının kaynak yetkilerini koruyan bağlantısı ve ayrıca verilmiş erişim izni olmadan açılamaz.',
        petitions:'Dilekçe şablon alan eşlemesi ve onaylı belge akışı tamamlanmadan bu modül açılamaz.',
        institution_guide:'Kurum Rehberi şu anda Kurum Görüşleri içindeki iletişim alanlarında yer alıyor; ayrı modül akışı henüz hazır değil.',
      };
      throw new ConflictException({code:'MODULE_NOT_READY',message:messages[moduleKey]});
    }
    if(!enabled&&['overview','tasks','users','permissions','settings'].includes(moduleKey)) {
      throw new ConflictException({code:'CORE_MODULE_REQUIRED',message:'Bu temel modül kapatılamaz.'});
    }
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const current=await client.query<{display_name:string;is_enabled:boolean}>(
        'SELECT display_name,is_enabled FROM app_modules WHERE module_key=$1 FOR UPDATE',[moduleKey],
      );
      if(!current.rowCount) throw new NotFoundException({code:'MODULE_NOT_FOUND',message:'Modül bulunamadı.'});
      if(current.rows[0].is_enabled!==enabled) {
        await client.query('UPDATE app_modules SET is_enabled=$2 WHERE module_key=$1',[moduleKey,enabled]);
        await client.query(
          `INSERT INTO auth_audit_events(actor_user_id,action,details)
           VALUES($1,$2,$3)`,
          [actor.id,enabled?'module.enabled':'module.disabled',{moduleKey,displayName:current.rows[0].display_name,enabled}],
        );
      }
      await client.query('COMMIT');
      return {moduleKey,displayName:current.rows[0].display_name,enabled};
    } catch(error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {client.release();}
  }

  async replaceRoleModulePermissions(actor:AuthUser,roleCode:string,moduleKey:string,input:unknown) {
    if(!MODULE_KEY.test(roleCode)||!MODULE_KEY.test(moduleKey)) throw new BadRequestException({code:'INVALID_PERMISSION_TARGET',message:'Rol veya modül tanımı geçersiz.'});
    if(!input||typeof input!=='object'||Array.isArray(input)) throw new BadRequestException({code:'INVALID_PERMISSION_SET',message:'İzin listesi geçersiz.'});
    const value=input as Record<string,unknown>;
    if(Object.keys(value).length!==1||!Array.isArray(value.actions)||
      value.actions.length>MODULE_ACTIONS.length||
      value.actions.some(action=>typeof action!=='string'||!MODULE_ACTIONS.includes(action as ModuleAction))) {
      throw new BadRequestException({code:'INVALID_PERMISSION_SET',message:'İzin listesi geçersiz.'});
    }
    const actions=[...new Set(value.actions as ModuleAction[])];
    if(actions.includes('manage')&&actions.length!==1) throw new BadRequestException({code:'INVALID_PERMISSION_SET',message:'Yönetim izni tek başına tanımlanmalıdır.'});
    if(roleCode==='system_admin'&&['users','permissions','settings'].includes(moduleKey)&&!actions.includes('manage')) {
      throw new ConflictException({code:'SYSTEM_ADMIN_POLICY_LOCKED',message:'Sistem yöneticisinin kullanıcı ve izin yönetimi emniyet yetkisi kaldırılamaz.'});
    }
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const role=await client.query<{id:string}>('SELECT id FROM roles WHERE code=$1 FOR UPDATE',[roleCode]);
      if(!role.rowCount) throw new NotFoundException({code:'ROLE_NOT_FOUND',message:'Rol bulunamadı.'});
      const module=await client.query<{module_key:string}>('SELECT module_key FROM app_modules WHERE module_key=$1 FOR UPDATE',[moduleKey]);
      if(!module.rowCount) throw new NotFoundException({code:'MODULE_NOT_FOUND',message:'Modül bulunamadı.'});
      await client.query('DELETE FROM role_module_permissions WHERE role_id=$1 AND module_key=$2',[role.rows[0].id,moduleKey]);
      if(actions.length) await client.query(
        `INSERT INTO role_module_permissions(role_id,module_key,permission_key,assigned_by)
         SELECT $1,$2,permissions.permission_key,$3 FROM unnest(string_to_array($4,',')) AS permissions(permission_key)`,
        [role.rows[0].id,moduleKey,actor.id,actions.join(',')],
      );
      await client.query(
        `INSERT INTO auth_audit_events(actor_user_id,action,details)
         VALUES($1,'module.permissions.updated',$2)`,
        [actor.id,{roleCode,moduleKey,actions}],
      );
      await client.query('COMMIT');
      return {roleCode,moduleKey,actions};
    } catch(error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {client.release();}
  }
}
