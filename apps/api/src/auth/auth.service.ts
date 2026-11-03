import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { DatabaseService } from '../database/database.service.js';
import { PasswordHasher, validateNewPassword, validatePasswordInput } from './password-hasher.js';

const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
const CSRF_CHALLENGE_MS = 5 * 60 * 1000;
const TEMP_PASSWORD_MS = 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_ID_LIMIT = 5;
const LOGIN_IP_LIMIT = 30;

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  mustChangePassword: boolean;
  roles: string[];
  jobTitle: string;
  department: string;
  avatarKey: string;
}

export interface SessionResult {
  user: AuthUser;
  sessionToken: string;
  csrfToken: string;
}

export interface ManagedUser extends AuthUser {
  status: 'active' | 'disabled';
  createdAt: string;
}

interface AccountRow {
  id: string;
  username: string;
  email: string;
  display_name: string;
  job_title: string;
  department: string;
  avatar_key: string;
  password_hash: string;
  status: 'active' | 'disabled';
  must_change_password: boolean;
  password_expires_at: Date | string | null;
}

@Injectable()
export class AuthService {
  private readonly hasher = new PasswordHasher();
  private readonly origin: string;
  private readonly rateLimitSecret: string;
  readonly secureCookies: boolean;
  readonly cookieName: string;
  private readonly dummyHash: Promise<string>;

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(ConfigService) config: ConfigService) {
    const production = config.get<string>('NODE_ENV') === 'production';
    this.origin = config.get<string>('APP_ORIGIN') ?? 'http://127.0.0.1:5173';
    try {
      const parsed = new URL(this.origin);
      if (parsed.origin !== this.origin || (production && parsed.protocol !== 'https:')) throw new Error();
    } catch {
      throw new Error('Application origin configuration is invalid.');
    }

    this.rateLimitSecret = config.get<string>('AUTH_RATE_LIMIT_SECRET') ?? '';
    if (Buffer.byteLength(this.rateLimitSecret) < 32) {
      throw new Error('Authentication rate-limit secret configuration is missing or too short.');
    }

    this.secureCookies = production || config.get<string>('AUTH_COOKIE_SECURE') === 'true';
    if (production && config.get<string>('AUTH_COOKIE_SECURE') !== 'true') {
      throw new Error('Secure authentication cookies are required in production.');
    }
    this.cookieName = this.secureCookies ? '__Host-pulse_session' : 'pulse_session';
    this.dummyHash = this.hasher.hash(randomBytes(32).toString('base64url'));
  }

  async issueLoginChallenge(request: Request): Promise<{ csrfToken: string }> {
    this.assertOrigin(request);
    this.assertJsonContentType(request);
    const ipHash = this.rateLimitHash(`csrf-ip:${this.clientAddress(request)}`);
    const state = await this.consumeLimit(ipHash, LOGIN_IP_LIMIT);
    if (state.blocked) throw new HttpException({ code: 'REQUEST_LIMITED', message: 'Bir süre sonra yeniden deneyin.' }, HttpStatus.TOO_MANY_REQUESTS);

    await this.db.query(`DELETE FROM auth_csrf_challenges WHERE expires_at <= now() OR consumed_at < now() - interval '10 minutes'`);
    await this.db.query(`DELETE FROM auth_rate_limit_buckets WHERE window_started_at < now() - interval '1 day'`);

    const token = randomBytes(32).toString('base64url');
    await this.db.query(
      `INSERT INTO auth_csrf_challenges (challenge_hash, origin, expires_at)
       VALUES ($1, $2, now() + ($3 * interval '1 millisecond'))`,
      [sha256(token), this.origin, CSRF_CHALLENGE_MS],
    );
    return { csrfToken: token };
  }

  async login(request: Request, identifierInput: unknown, passwordInput: unknown): Promise<SessionResult> {
    this.assertOrigin(request);
    this.assertJsonContentType(request);
    const challenge = this.readCsrfHeader(request);
    const challengeResult = await this.db.query(
      `UPDATE auth_csrf_challenges SET consumed_at = now()
       WHERE challenge_hash = $1 AND origin = $2 AND consumed_at IS NULL AND expires_at > now()
       RETURNING challenge_hash`,
      [sha256(challenge), this.origin],
    );
    if (!challengeResult.rowCount) throw new ForbiddenException({ code: 'CSRF_INVALID', message: 'Güvenlik doğrulaması yenilenemedi. Sayfayı yenileyip tekrar deneyin.' });

    if (typeof identifierInput !== 'string' || typeof passwordInput !== 'string' || identifierInput.length > 254) {
      throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'E-posta/kullanıcı adı ve parola alanlarını kontrol edin.' });
    }
    validatePasswordInput(passwordInput);
    const identifier = identifierInput.trim().toLowerCase();
    if (!identifier || Buffer.byteLength(identifier, 'utf8') > 254) {
      throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'E-posta/kullanıcı adı ve parola alanlarını kontrol edin.' });
    }

    const identifierHash = this.rateLimitHash(`login-id:${identifier}`);
    const ipHash = this.rateLimitHash(`login-ip:${this.clientAddress(request)}`);
    const [identityLimit, ipLimit] = await Promise.all([
      this.consumeLimit(identifierHash, LOGIN_ID_LIMIT),
      this.consumeLimit(ipHash, LOGIN_IP_LIMIT),
    ]);
    if (identityLimit.blocked || ipLimit.blocked) {
      throw new HttpException({ code: 'LOGIN_RATE_LIMITED', message: 'Çok fazla giriş denemesi yapıldı. Bir süre sonra yeniden deneyin.' }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const result = await this.db.query<AccountRow>(
      `SELECT id, username, email, display_name, job_title, department, avatar_key, password_hash, status, must_change_password, password_expires_at
       FROM users WHERE username = $1 OR email = $1 LIMIT 1`,
      [identifier],
    );
    const account = result.rows[0];
    const hash = account?.password_hash ?? await this.dummyHash;
    const passwordMatches = await this.hasher.verify(passwordInput, hash);
    const temporaryPasswordExpiresAt = account?.password_expires_at instanceof Date
      ? account.password_expires_at.getTime()
      : account?.password_expires_at ? Date.parse(account.password_expires_at) : null;
    const temporaryPasswordExpired = temporaryPasswordExpiresAt !== null
      && temporaryPasswordExpiresAt <= Date.now();
    if (!account || account.status !== 'active' || !passwordMatches || temporaryPasswordExpired) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'E-posta/kullanıcı adı veya parola hatalı.' });
    }

    const rolesResult = await this.db.query<{ code: string }>(
      `SELECT r.code FROM user_role_assignments ura JOIN roles r ON r.id = ura.role_id WHERE ura.user_id = $1`,
      [account.id],
    );
    return this.createSession(account, rolesResult.rows.map((row) => row.code));
  }

  async currentSession(request: Request): Promise<{ user: AuthUser; csrfToken: string } | null> {
    const token = this.readSessionCookie(request);
    if (!token) return null;
    const session = await this.findSession(token);
    if (!session) return null;
    return { user: session.user, csrfToken: csrfForSession(token) };
  }

  async authorizeRequest(request: Request, write = false): Promise<AuthUser> {
    const session = await this.requireSession(request);
    if (session.user.mustChangePassword) {
      throw new ForbiddenException({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Bu işlemden önce parolanızı değiştirin.' });
    }
    if (write) {
      this.assertOrigin(request);
      this.assertJsonContentType(request);
      await this.assertSessionCsrf(request, session.csrfTokenHash);
    }
    return session.user;
  }

  async logout(request: Request): Promise<void> {
    this.assertOrigin(request);
    this.assertJsonContentType(request);
    const token = this.readSessionCookie(request);
    if (!token) return;
    const session = await this.findSession(token);
    if (session) {
      await this.assertSessionCsrf(request, session.csrfTokenHash);
      await this.db.query('UPDATE auth_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [session.id]);
    }
  }

  async changePassword(request: Request, currentPasswordInput: unknown, newPasswordInput: unknown): Promise<SessionResult> {
    this.assertOrigin(request);
    this.assertJsonContentType(request);
    const authSession = await this.requireSession(request);
    await this.assertSessionCsrf(request, authSession.csrfTokenHash);
    if (typeof currentPasswordInput !== 'string' || typeof newPasswordInput !== 'string') {
      throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'Parola alanlarını kontrol edin.' });
    }
    validateNewPassword(newPasswordInput);
    if (newPasswordInput === currentPasswordInput) {
      throw new BadRequestException({ code: 'PASSWORD_UNCHANGED', message: 'Yeni parola mevcut paroladan farklı olmalıdır.' });
    }
    const accountResult = await this.db.query<AccountRow>(
      `SELECT id, username, email, display_name, job_title, department, avatar_key, password_hash, status, must_change_password, password_expires_at
       FROM users WHERE id = $1`,
      [authSession.user.id],
    );
    const account = accountResult.rows[0];
    if (!account || !await this.hasher.verify(currentPasswordInput, account.password_hash)) {
      throw new UnauthorizedException({ code: 'CURRENT_PASSWORD_INVALID', message: 'Mevcut parola hatalı.' });
    }

    const passwordHash = await this.hasher.hash(newPasswordInput);
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE users SET password_hash = $1, must_change_password = false, password_expires_at = NULL, updated_at = now()
         WHERE id = $2`,
        [passwordHash, account.id],
      );
      await client.query('UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [account.id]);
      await client.query(
        `INSERT INTO auth_audit_events (actor_user_id, target_user_id, action)
         VALUES ($1, $1, 'password.changed')`,
        [account.id],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.createSession({ ...account, password_hash: passwordHash, must_change_password: false, password_expires_at: null }, authSession.user.roles);
  }

  async createUser(request: Request, input: unknown): Promise<{ user: ManagedUser; temporaryPassword: string }> {
    this.assertOrigin(request);
    this.assertJsonContentType(request);
    const admin = await this.requireSession(request);
    await this.assertSessionCsrf(request, admin.csrfTokenHash);
    this.assertAdmin(admin.user);
    const values = validateCreateUserInput(input);
    const temporaryPassword = randomBytes(24).toString('base64url');
    const avatarKey = values.avatarKey ?? ['cat','fox','panda','rabbit','owl','bear','koala','penguin','otter','deer','raccoon','tiger'][randomInt(0,12)];
    const roleCodes = [...new Set(['employee', ...values.roleCodes])];
    const passwordHash = await this.hasher.hash(temporaryPassword);
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const created = await client.query<AccountRow & { created_at: Date }>(
        `INSERT INTO users (username, email, display_name, job_title, department, avatar_key, password_hash, must_change_password, password_expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, now() + ($8 * interval '1 millisecond'), $9)
         RETURNING id, username, email, display_name, job_title, department, avatar_key, password_hash, status, must_change_password, password_expires_at, created_at`,
        [values.username, values.email, values.displayName, values.jobTitle, values.department, avatarKey, passwordHash, TEMP_PASSWORD_MS, admin.user.id],
      );
      const account = created.rows[0];
      const availableRoles = await client.query<{id:string;code:string}>(
        `SELECT id,code FROM roles WHERE code = ANY($1::text[])`, [roleCodes],
      );
      if (availableRoles.rowCount !== roleCodes.length) {
        throw new BadRequestException({code:'INVALID_ROLE',message:'Seçilen kullanıcı rollerinden biri tanımlı değil.'});
      }
      for (const role of availableRoles.rows) {
        await client.query(
          `INSERT INTO user_role_assignments (user_id, role_id, assigned_by) VALUES ($1,$2,$3)`,
          [account.id, role.id, admin.user.id],
        );
      }
      await client.query(
        `INSERT INTO auth_audit_events (actor_user_id, target_user_id, action)
         VALUES ($1, $2, 'user.created')`,
        [admin.user.id, account.id],
      );
      await client.query('COMMIT');
      return {
        user: { ...toAuthUser(account, roleCodes), status: 'active', createdAt: account.created_at.toISOString() },
        temporaryPassword,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(error)) throw new ConflictException({ code: 'ACCOUNT_IDENTIFIER_IN_USE', message: 'Bu kullanıcı adı veya e-posta başka bir hesapta kullanılıyor.' });
      throw error;
    } finally {
      client.release();
    }
  }

  async listUsers(request: Request): Promise<{ users: ManagedUser[] }> {
    const admin = await this.requireSession(request);
    this.assertAdmin(admin.user);
    const result = await this.db.query<AccountRow & { roles: string[]; created_at: Date }>(
      `SELECT u.id, u.username, u.email, u.display_name, u.job_title, u.department, u.avatar_key,
              u.password_hash, u.status, u.must_change_password, u.password_expires_at, u.created_at,
              COALESCE(array_agg(r.code) FILTER (WHERE r.code IS NOT NULL), ARRAY[]::text[]) AS roles
       FROM users u
       LEFT JOIN user_role_assignments ura ON ura.user_id = u.id
       LEFT JOIN roles r ON r.id = ura.role_id
       GROUP BY u.id
       ORDER BY u.display_name, u.created_at
       LIMIT 200`,
    );
    return {
      users: result.rows.map((row) => ({
        ...toAuthUser(row, row.roles),
        status: row.status,
        createdAt: new Date(row.created_at).toISOString(),
      })),
    };
  }

  async listPeople(): Promise<{people:Array<Record<string,unknown>>}> {
    const result=await this.db.query(
      `SELECT u.id,u.display_name AS "displayName",u.username,u.email,
        u.job_title AS "jobTitle",u.department,u.avatar_key AS "avatarKey",
        COALESCE(array_agg(r.code) FILTER (WHERE r.code IS NOT NULL),ARRAY[]::text[]) AS roles
       FROM users u
       LEFT JOIN user_role_assignments ura ON ura.user_id=u.id
       LEFT JOIN roles r ON r.id=ura.role_id
       WHERE u.status='active'
       GROUP BY u.id
       ORDER BY u.department,u.display_name
       LIMIT 500`,
    );
    return {people:result.rows};
  }

  async listRoles(request: Request): Promise<{roles:Array<{code:string;displayName:string}>}> {
    const admin=await this.requireSession(request);
    this.assertAdmin(admin.user);
    const result=await this.db.query(
      `SELECT code,display_name AS "displayName" FROM roles
       WHERE code<>'system_admin' OR $1=true
       ORDER BY CASE code WHEN 'employee' THEN 0 WHEN 'team_lead' THEN 1
         WHEN 'project_manager' THEN 2 WHEN 'process_owner' THEN 3
         WHEN 'document_steward' THEN 4 WHEN 'auditor' THEN 5 ELSE 9 END,display_name`,
      [admin.user.roles.includes('system_admin')],
    );
    return {roles:result.rows};
  }

  async updateUserProfile(request: Request,targetUserId: string,input: unknown): Promise<{user:ManagedUser}> {
    this.assertOrigin(request);
    this.assertJsonContentType(request);
    const admin=await this.requireSession(request);
    await this.assertSessionCsrf(request,admin.csrfTokenHash);
    this.assertAdmin(admin.user);
    if(!isUuid(targetUserId)) throw new BadRequestException({code:'INVALID_USER_ID',message:'Kullanıcı kimliği geçersiz.'});
    if(!input||typeof input!=='object'||Array.isArray(input)) throw new BadRequestException({code:'INVALID_REQUEST',message:'Profil bilgilerini kontrol edin.'});
    const value=input as Record<string,unknown>;
    const allowed=new Set(['displayName','jobTitle','department','avatarKey','roleCodes']);
    if(Object.keys(value).some((key)=>!allowed.has(key))||Object.keys(value).length===0) {
      throw new BadRequestException({code:'INVALID_REQUEST',message:'Profil alanlarını kontrol edin.'});
    }
    const displayName=value.displayName===undefined?null:typeof value.displayName==='string'?value.displayName.trim():null;
    const jobTitle=value.jobTitle===undefined?null:typeof value.jobTitle==='string'?value.jobTitle.trim():null;
    const department=value.department===undefined?null:typeof value.department==='string'?value.department.trim():null;
    const avatarKey=value.avatarKey===undefined?null:typeof value.avatarKey==='string'?value.avatarKey:null;
    const avatars=['cat','fox','panda','rabbit','owl','bear','koala','penguin','otter','deer','raccoon','tiger'];
    if((value.displayName!==undefined&&(!displayName||displayName.length>120))
      ||(value.jobTitle!==undefined&&(jobTitle===null||jobTitle.length>120))
      ||(value.department!==undefined&&(department===null||department.length>100))
      ||(value.avatarKey!==undefined&&(avatarKey===null||!avatars.includes(avatarKey)))) {
      throw new BadRequestException({code:'INVALID_PROFILE',message:'Ad, meslek, birim veya avatar bilgisini kontrol edin.'});
    }
    if(value.roleCodes!==undefined&&(!Array.isArray(value.roleCodes)||value.roleCodes.length>10||value.roleCodes.some((role)=>typeof role!=='string'))) {
      throw new BadRequestException({code:'INVALID_ROLE',message:'Kullanıcı rolleri geçersiz.'});
    }

    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('encev-pulse-admin-account-change'))`);
      const existing=await client.query(
        `SELECT u.id,u.status,u.display_name,u.job_title,u.department,u.avatar_key,
          EXISTS(SELECT 1 FROM user_role_assignments ura JOIN roles r ON r.id=ura.role_id
            WHERE ura.user_id=u.id AND r.code='system_admin') AS is_admin
         FROM users u WHERE u.id=$1 FOR UPDATE`,[targetUserId],
      );
      if(!existing.rowCount) throw new BadRequestException({code:'USER_NOT_FOUND',message:'Kullanıcı bulunamadı.'});
      const old=existing.rows[0];
      let roleCodes:string[];
      if(value.roleCodes===undefined) {
        const current=await client.query(
          `SELECT r.code FROM user_role_assignments ura JOIN roles r ON r.id=ura.role_id WHERE ura.user_id=$1`,[targetUserId],
        );
        roleCodes=current.rows.map((row)=>row.code as string);
      } else {
        roleCodes=[...new Set(['employee',...(value.roleCodes as string[])])];
      }
      const available=await client.query(`SELECT id,code FROM roles WHERE code=ANY($1::text[])`,[roleCodes]);
      if(available.rowCount!==roleCodes.length) throw new BadRequestException({code:'INVALID_ROLE',message:'Seçilen rollerden biri sistemde tanımlı değil.'});
      const willBeAdmin=roleCodes.includes('system_admin');
      if(old.status==='active'&&old.is_admin&&!willBeAdmin) {
        const admins=await client.query(
          `SELECT count(*) FROM users u JOIN user_role_assignments ura ON ura.user_id=u.id
           JOIN roles r ON r.id=ura.role_id WHERE u.status='active' AND r.code='system_admin'`,
        );
        if(Number(admins.rows[0].count)<=1) throw new ConflictException({code:'LAST_ADMIN_REQUIRED',message:'En az bir etkin sistem yöneticisi kalmalıdır.'});
      }
      const nextName=displayName??old.display_name;
      const nextTitle=jobTitle??old.job_title;
      const nextDepartment=department??old.department;
      const nextAvatar=avatarKey??old.avatar_key;
      await client.query(
        `UPDATE users SET display_name=$1,job_title=$2,department=$3,avatar_key=$4,updated_at=now() WHERE id=$5`,
        [nextName,nextTitle,nextDepartment,nextAvatar,targetUserId],
      );
      if(value.roleCodes!==undefined) {
        await client.query(`DELETE FROM user_role_assignments WHERE user_id=$1`,[targetUserId]);
        for(const role of available.rows) {
          await client.query(
            `INSERT INTO user_role_assignments(user_id,role_id,assigned_by) VALUES($1,$2,$3)`,
            [targetUserId,role.id,admin.user.id],
          );
        }
      }
      const changedFields=Object.keys(value);
      await client.query(
        `INSERT INTO auth_audit_events(actor_user_id,target_user_id,action,details)
         VALUES($1,$2,'user.profile.updated',$3)`,[admin.user.id,targetUserId,{fields:changedFields}],
      );
      const account=await client.query(
        `SELECT u.id,u.username,u.email,u.display_name,u.job_title,u.department,u.avatar_key,
          u.must_change_password,u.status,u.created_at,
          COALESCE(array_agg(r.code) FILTER (WHERE r.code IS NOT NULL),ARRAY[]::text[]) AS roles
         FROM users u LEFT JOIN user_role_assignments ura ON ura.user_id=u.id
         LEFT JOIN roles r ON r.id=ura.role_id WHERE u.id=$1
         GROUP BY u.id`,[targetUserId],
      );
      await client.query('COMMIT');
      const row=account.rows[0];
      return {user:{
        ...toAuthUser(row,row.roles),status:row.status,
        createdAt:new Date(row.created_at).toISOString(),
      }};
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async disableUser(request: Request, targetUserId: string): Promise<void> {
    this.assertOrigin(request);
    this.assertJsonContentType(request);
    const admin = await this.requireSession(request);
    await this.assertSessionCsrf(request, admin.csrfTokenHash);
    this.assertAdmin(admin.user);
    if (!isUuid(targetUserId)) throw new BadRequestException({ code: 'INVALID_USER_ID', message: 'Kullanıcı kimliği geçersiz.' });
    if (targetUserId === admin.user.id) throw new ConflictException({ code: 'CANNOT_DISABLE_SELF', message: 'Kendi hesabınızı devre dışı bırakamazsınız.' });

    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('encev-pulse-admin-account-change'))");
      const target = await client.query<{ status: string; is_admin: boolean }>(
        `SELECT u.status, EXISTS (
           SELECT 1 FROM user_role_assignments ura JOIN roles r ON r.id = ura.role_id
           WHERE ura.user_id = u.id AND r.code = 'system_admin'
         ) AS is_admin FROM users u WHERE u.id = $1 FOR UPDATE`,
        [targetUserId],
      );
      if (!target.rowCount) throw new BadRequestException({ code: 'USER_NOT_FOUND', message: 'Kullanıcı bulunamadı.' });
      if (target.rows[0].status === 'disabled') {
        await client.query('COMMIT');
        return;
      }
      if (target.rows[0].status === 'active' && target.rows[0].is_admin) {
        const admins = await client.query<{ count: string }>(
          `SELECT count(*) FROM users u
           JOIN user_role_assignments ura ON ura.user_id = u.id
           JOIN roles r ON r.id = ura.role_id
           WHERE u.status = 'active' AND r.code = 'system_admin'`,
        );
        if (Number(admins.rows[0].count) <= 1) {
          throw new ConflictException({ code: 'LAST_ADMIN_REQUIRED', message: 'En az bir etkin sistem yöneticisi kalmalıdır.' });
        }
      }
      await client.query("UPDATE users SET status = 'disabled', updated_at = now() WHERE id = $1", [targetUserId]);
      await client.query('UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [targetUserId]);
      await client.query(
        `INSERT INTO auth_audit_events (actor_user_id, target_user_id, action)
         VALUES ($1, $2, 'user.disabled')`,
        [admin.user.id, targetUserId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async resetUserPassword(request: Request, targetUserId: string): Promise<{ temporaryPassword: string }> {
    this.assertOrigin(request);
    this.assertJsonContentType(request);
    const admin = await this.requireSession(request);
    await this.assertSessionCsrf(request, admin.csrfTokenHash);
    this.assertAdmin(admin.user);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
      throw new BadRequestException({ code: 'INVALID_USER_ID', message: 'Kullanıcı kimliği geçersiz.' });
    }
    if (targetUserId === admin.user.id) throw new ConflictException({ code: 'CANNOT_RESET_SELF', message: 'Kendi parolanızı kullanıcı yönetiminden yenileyemezsiniz.' });

    const temporaryPassword = randomBytes(24).toString('base64url');
    const passwordHash = await this.hasher.hash(temporaryPassword);
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE users SET password_hash = $1, must_change_password = true,
         password_expires_at = now() + ($2 * interval '1 millisecond'), updated_at = now()
         WHERE id = $3 AND status = 'active' RETURNING id`,
        [passwordHash, TEMP_PASSWORD_MS, targetUserId],
      );
      if (!updated.rowCount) throw new BadRequestException({ code: 'USER_NOT_FOUND', message: 'Etkin kullanıcı bulunamadı.' });
      await client.query('UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [targetUserId]);
      await client.query(
        `INSERT INTO auth_audit_events (actor_user_id, target_user_id, action)
         VALUES ($1, $2, 'user.password_reset')`,
        [admin.user.id, targetUserId],
      );
      await client.query('COMMIT');
      return { temporaryPassword };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async createSession(account: AccountRow, roles: string[]): Promise<SessionResult> {
    const sessionToken = randomBytes(32).toString('base64url');
    const csrfToken = csrfForSession(sessionToken);
    await this.db.query(
      `INSERT INTO auth_sessions (user_id, session_token_hash, csrf_token_hash, idle_expires_at, expires_at)
       VALUES ($1, $2, $3, now() + ($4 * interval '1 millisecond'), now() + ($5 * interval '1 millisecond'))`,
      [account.id, sha256(sessionToken), sha256(csrfToken), SESSION_IDLE_MS, SESSION_ABSOLUTE_MS],
    );
    return { user: toAuthUser(account, roles), sessionToken, csrfToken };
  }

  private async findSession(token: string): Promise<{ id: string; user: AuthUser; csrfTokenHash: string } | null> {
    const tokenHash = sha256(token);
    const result = await this.db.query<AccountRow & { session_id: string; csrf_token_hash: string }>(
      `SELECT s.id AS session_id, s.csrf_token_hash, u.id, u.username, u.email, u.display_name,
              u.job_title, u.department, u.avatar_key, u.password_hash, u.status, u.must_change_password, u.password_expires_at
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.session_token_hash = $1 AND s.revoked_at IS NULL
         AND s.idle_expires_at > now() AND s.expires_at > now() AND u.status = 'active'`,
      [tokenHash],
    );
    const account = result.rows[0];
    if (!account) return null;
    const rolesResult = await this.db.query<{ code: string }>(
      `SELECT r.code FROM user_role_assignments ura JOIN roles r ON r.id = ura.role_id WHERE ura.user_id = $1`,
      [account.id],
    );
    await this.db.query(
      `UPDATE auth_sessions SET last_seen_at = now(), idle_expires_at = LEAST(expires_at, now() + ($2 * interval '1 millisecond'))
       WHERE id = $1 AND last_seen_at < now() - interval '5 minutes'`,
      [account.session_id, SESSION_IDLE_MS],
    );
    return { id: account.session_id, user: toAuthUser(account, rolesResult.rows.map((row) => row.code)), csrfTokenHash: account.csrf_token_hash };
  }

  private async requireSession(request: Request): Promise<{ id: string; user: AuthUser; csrfTokenHash: string }> {
    const token = this.readSessionCookie(request);
    if (!token) throw new UnauthorizedException({ code: 'SESSION_REQUIRED', message: 'Oturum açmanız gerekiyor.' });
    const session = await this.findSession(token);
    if (!session) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Oturum süresi doldu. Yeniden giriş yapın.' });
    return session;
  }

  private async assertSessionCsrf(request: Request, expectedHash: string): Promise<void> {
    const token = this.readCsrfHeader(request);
    if (!safeEqualHex(sha256(token), expectedHash)) {
      throw new ForbiddenException({ code: 'CSRF_INVALID', message: 'Güvenlik doğrulaması başarısız oldu.' });
    }
  }

  private readCsrfHeader(request: Request): string {
    const token = request.header('x-csrf-token');
    if (!token || token.length > 128) throw new ForbiddenException({ code: 'CSRF_REQUIRED', message: 'Güvenlik doğrulaması gerekiyor.' });
    return token;
  }

  private assertOrigin(request: Request): void {
    if (request.header('origin') !== this.origin) {
      throw new ForbiddenException({ code: 'ORIGIN_REJECTED', message: 'İstek kaynağı doğrulanamadı.' });
    }
  }

  private assertJsonContentType(request: Request): void {
    if (!request.is('application/json')) {
      throw new BadRequestException({ code: 'JSON_REQUIRED', message: 'İstek biçimi desteklenmiyor.' });
    }
  }

  private readSessionCookie(request: Request): string | null {
    const cookie = request.header('cookie');
    if (!cookie) return null;
    const prefix = `${this.cookieName}=`;
    const value = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length);
    return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  }

  private clientAddress(request: Request): string {
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  private rateLimitHash(value: string): string {
    return createHmac('sha256', this.rateLimitSecret).update(value).digest('hex');
  }

  private async consumeLimit(dimensionHash: string, maximum: number): Promise<{ blocked: boolean; retrySeconds: number }> {
    const result = await this.db.query<{ attempt_count: number; blocked_until: Date | null; retry_seconds: number }>(
      `WITH bucket AS (
         INSERT INTO auth_rate_limit_buckets (dimension_hash, window_started_at, attempt_count, updated_at)
         VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / $2) * $2), 1, now())
         ON CONFLICT (dimension_hash, window_started_at) DO UPDATE
         SET attempt_count = auth_rate_limit_buckets.attempt_count + 1,
             blocked_until = CASE
               WHEN auth_rate_limit_buckets.attempt_count + 1 > $3
                 THEN to_timestamp(floor(extract(epoch FROM now()) / $2) * $2) + ($2 * interval '1 second')
               ELSE auth_rate_limit_buckets.blocked_until END,
             updated_at = now()
         RETURNING attempt_count, blocked_until
       )
       SELECT attempt_count, blocked_until,
         GREATEST(0, ceil(extract(epoch FROM (blocked_until - now()))))::int AS retry_seconds
       FROM bucket`,
      [dimensionHash, LOGIN_WINDOW_SECONDS, maximum],
    );
    const row = result.rows[0];
    return { blocked: row.attempt_count > maximum || Boolean(row.blocked_until && row.retry_seconds > 0), retrySeconds: row.retry_seconds };
  }

  private assertAdmin(user: AuthUser): void {
    if (user.mustChangePassword) throw new ForbiddenException({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Bu işlemden önce parolanızı değiştirin.' });
    if (!user.roles.includes('system_admin')) throw new ForbiddenException({ code: 'ADMIN_REQUIRED', message: 'Bu işlem için sistem yöneticisi yetkisi gerekiyor.' });
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function csrfForSession(sessionToken: string): string {
  return createHmac('sha256', sessionToken).update('encev-pulse-session-csrf-v1').digest('base64url');
}

function safeEqualHex(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(expected)) return false;
  const left = Buffer.from(actual, 'hex');
  const right = Buffer.from(expected, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function toAuthUser(account: Pick<AccountRow, 'id' | 'username' | 'email' | 'display_name' | 'must_change_password' | 'job_title' | 'department' | 'avatar_key'>, roles: string[]): AuthUser {
  return {
    id: account.id,
    username: account.username,
    email: account.email,
    displayName: account.display_name,
    mustChangePassword: account.must_change_password,
    roles,
    jobTitle: account.job_title ?? '',
    department: account.department ?? '',
    avatarKey: account.avatar_key ?? 'cat',
  };
}

function validateCreateUserInput(input: unknown): {
  username:string; email:string; displayName:string; jobTitle:string; department:string;
  avatarKey:string|null; roleCodes:string[];
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'Kullanıcı bilgilerini kontrol edin.' });
  const value = input as Record<string, unknown>;
  if (typeof value.username !== 'string' || typeof value.email !== 'string' || typeof value.displayName !== 'string') {
    throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'Kullanıcı bilgilerini kontrol edin.' });
  }
  const username=value.username.trim().toLowerCase();
  const email=value.email.trim().toLowerCase();
  const displayName=value.displayName.trim();
  const jobTitle=typeof value.jobTitle==='string'?value.jobTitle.trim():'';
  const department=typeof value.department==='string'?value.department.trim():'';
  const avatarKey=typeof value.avatarKey==='string'?value.avatarKey:null;
  const roleCodes=Array.isArray(value.roleCodes)&&value.roleCodes.every((role)=>typeof role==='string')?value.roleCodes as string[]:[];
  const avatars=['cat','fox','panda','rabbit','owl','bear','koala','penguin','otter','deer','raccoon','tiger'];
  if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)
    || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@encev\.com\.tr$/.test(email)
    || displayName.length<1 || displayName.length>120
    || jobTitle.length>120 || department.length>100
    || (avatarKey!==null&&!avatars.includes(avatarKey))
    || roleCodes.length>10 || roleCodes.some((role)=>!/^[a-z][a-z0-9_]{1,40}$/.test(role))) {
    throw new BadRequestException({code:'INVALID_REQUEST',message:'Kullanıcı adı, kurumsal e-posta veya profil bilgilerini kontrol edin.'});
  }
  return {username,email,displayName,jobTitle,department,avatarKey,roleCodes};
}
function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
