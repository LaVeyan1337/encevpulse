import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import type { AuthUser } from '../auth/auth.service.js';

const TOKEN = /^[A-Za-z0-9_-]{40,100}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPORT_WINDOW_MS = 60_000;
const CLAIM_WINDOW_MS = 180_000;

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function normalizeAccount(value: string): string {
  return value.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim().slice(0, 110);
}
function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException({ code: 'INVALID_ECED_INPUT', message: 'İstek gövdesi geçersiz.' });
  }
  return input as Record<string, unknown>;
}
function invalid(message: string): never {
  throw new BadRequestException({ code: 'INVALID_ECED_INPUT', message });
}
function urlParts(value: unknown): { origin: string; path: string } {
  const raw = clean(value, 2048);
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      return { origin: '', path: '' };
    }
    return { origin: parsed.origin.slice(0, 180), path: (parsed.pathname || '/').slice(0, 160) };
  } catch {
    return { origin: '', path: '' };
  }
}
function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

@Injectable()
export class EcedMonitorService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async createPairing(user: AuthUser, input: unknown) {
    const value = objectInput(input);
    const deviceName = clean(value.deviceName, 80);
    if (deviceName.length < 2) invalid('Cihaz adı en az 2 karakter olmalıdır.');
    const token = randomBytes(32).toString('base64url');
    const result = await this.db.query(
      'INSERT INTO eced_browser_devices(user_id,device_name,token_hash) VALUES($1,$2,$3) RETURNING id,device_name AS "deviceName",created_at AS "createdAt"',
      [user.id, deviceName, hashToken(token)],
    );
    await this.db.query(
      "INSERT INTO eced_audit_events(actor_user_id,device_id,event_type,details) VALUES($1,$2,'pairing_created',jsonb_build_object('deviceName',$3::text))",
      [user.id, result.rows[0].id, deviceName],
    );
    return { device: result.rows[0], pairingToken: token, apiPath: '/api' };
  }

  async revokePairing(user: AuthUser, deviceId: string) {
    if (!UUID.test(deviceId)) invalid('Cihaz kimliği geçersiz.');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const revoked = await client.query(
        'UPDATE eced_browser_devices SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id',
        [deviceId, user.id],
      );
      if (!revoked.rowCount) throw new NotFoundException({ code: 'ECED_DEVICE_NOT_FOUND', message: 'Etkin eşleştirme bulunamadı.' });
      await client.query('DELETE FROM eced_account_claims WHERE device_id=$1', [deviceId]);
      await client.query(
        "INSERT INTO eced_audit_events(actor_user_id,device_id,event_type) VALUES($1,$2,'pairing_revoked')",
        [user.id, deviceId],
      );
      await client.query('COMMIT');
      return { revoked: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getMonitor(user: AuthUser) {
    const [reports, devices, claims, seenAccounts] = await Promise.all([
      this.db.query(
        'SELECT r.id,r.device_id AS "deviceId",d.device_name AS "deviceName",owner.display_name AS "deviceOwnerName",r.browser,r.tab_id AS "tabId",r.tab_title AS "tabTitle",r.portal_origin AS "portalOrigin",r.page_path AS "pagePath",r.active_ui_tab AS "activeUiTab",r.account_name AS "accountName",r.normalized_account AS "normalizedAccount",r.account_source AS "accountSource",r.session_state AS "sessionState",r.tab_active AS "tabActive",r.last_seen AS "lastSeen" FROM eced_browser_reports r JOIN eced_browser_devices d ON d.id=r.device_id JOIN users owner ON owner.id=d.user_id WHERE d.revoked_at IS NULL AND owner.status=\\'active\\' ORDER BY r.last_seen DESC LIMIT 500',
      ),
      this.db.query(
        'SELECT id,device_name AS "deviceName",created_at AS "createdAt",last_seen_at AS "lastSeenAt" FROM eced_browser_devices WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 100',
        [user.id],
      ),
      this.db.query(
        'SELECT c.id,c.normalized_account AS "normalizedAccount",c.account_name AS "accountName",c.user_id AS "userId",u.display_name AS "ownerName",c.device_id AS "deviceId",d.device_name AS "deviceName",c.created_at AS "createdAt",c.last_seen AS "lastSeen",c.expires_at AS "expiresAt" FROM eced_account_claims c JOIN users u ON u.id=c.user_id JOIN eced_browser_devices d ON d.id=c.device_id WHERE c.expires_at>now() AND d.revoked_at IS NULL ORDER BY c.account_name',
      ),
      this.db.query(
        'SELECT normalized_account AS "normalizedAccount",account_name AS "accountName",first_seen AS "firstSeen",last_seen AS "lastSeen",last_device_name AS "lastDeviceName" FROM eced_seen_accounts ORDER BY last_seen DESC LIMIT 2000',
      ),
    ]);
    return {
      reports: reports.rows,
      devices: devices.rows,
      claims: claims.rows,
      seenAccounts: seenAccounts.rows,
      staleAfterSeconds: REPORT_WINDOW_MS / 1000,
      claimWindowSeconds: CLAIM_WINDOW_MS / 1000,
    };
  }

  async extensionHealth(token: string) {
    const device = await this.findDeviceForToken(token);
    return { ok: true, paired: true, deviceName: device.device_name, deviceId: device.id };
  }

  async acceptReport(token: string, input: unknown) {
    const value = objectInput(input);
    if (JSON.stringify(value).length > 16_384) invalid('Tarayıcı raporu 16 KB sınırını aşıyor.');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const device = await this.findDeviceForToken(token, client, true);
      const page = urlParts(value.url);
      if (!page.origin) invalid('Portal adresi güvenli bir HTTP(S) adresi olmalıdır.');
      const accountName = clean(value.accountName, 100);
      const normalizedAccount = normalizeAccount(accountName);
      const accountSourceRaw = clean(value.accountSource, 16);
      const accountSource = ['manual','portal','unknown'].includes(accountSourceRaw) ? accountSourceRaw : 'unknown';
      const sessionRaw = clean(value.sessionState, 16);
      let sessionState = ['active','logged_out','unknown'].includes(sessionRaw) ? sessionRaw : 'unknown';
      if (!normalizedAccount && sessionState === 'active') sessionState = 'unknown';
      const browser = clean(value.browser, 24) || 'unknown';
      const tabId = clean(value.tabId, 24) || '0';
      const clientId = clean(value.clientId, 64) || 'default';
      const tabTitle = clean(value.tabTitle, 120);
      const activeUiTab = clean(value.activeUiTab, 60);
      const tabActive = value.tabActive === true;
      const reportId = createHash('sha256').update(device.id + '|' + browser + '|' + clientId + '|' + tabId, 'utf8').digest('hex').slice(0, 24);
      await client.query(
        'INSERT INTO eced_browser_reports(device_id,report_id,browser,tab_id,tab_title,portal_origin,page_path,active_ui_tab,account_name,normalized_account,account_source,session_state,tab_active,last_seen) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()) ON CONFLICT(device_id,report_id) DO UPDATE SET browser=EXCLUDED.browser,tab_id=EXCLUDED.tab_id,tab_title=EXCLUDED.tab_title,portal_origin=EXCLUDED.portal_origin,page_path=EXCLUDED.page_path,active_ui_tab=EXCLUDED.active_ui_tab,account_name=EXCLUDED.account_name,normalized_account=EXCLUDED.normalized_account,account_source=EXCLUDED.account_source,session_state=EXCLUDED.session_state,tab_active=EXCLUDED.tab_active,last_seen=now()',
        [device.id,reportId,browser,tabId,tabTitle,page.origin,page.path,activeUiTab,accountName,normalizedAccount,accountSource,sessionState,tabActive],
      );
      if (normalizedAccount) {
        await client.query(
          'INSERT INTO eced_seen_accounts(normalized_account,account_name,first_seen,last_seen,last_device_id,last_device_name) VALUES($1,$2,now(),now(),$3,$4) ON CONFLICT(normalized_account) DO UPDATE SET account_name=CASE WHEN length(EXCLUDED.account_name)>0 THEN EXCLUDED.account_name ELSE eced_seen_accounts.account_name END,last_seen=now(),last_device_id=EXCLUDED.last_device_id,last_device_name=EXCLUDED.last_device_name',
          [normalizedAccount,accountName,device.id,device.device_name],
        );
      }
      await client.query('UPDATE eced_browser_devices SET last_seen_at=now() WHERE id=$1', [device.id]);
      await client.query("UPDATE eced_account_claims SET last_seen=now(),expires_at=now()+interval '3 minutes' WHERE device_id=$1", [device.id]);
      await client.query('COMMIT');
      return { queued: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async claimAccount(user: AuthUser, input: unknown) {
    const value = objectInput(input);
    const accountName = clean(value.accountName, 100);
    const normalizedAccount = normalizeAccount(accountName);
    const deviceId = clean(value.deviceId, 36);
    if (!normalizedAccount) invalid('Önce e-ÇED hesabı seçin.');
    if (!UUID.test(deviceId)) invalid('Eşleştirilmiş tarayıcı cihazı seçilmelidir.');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const device = await client.query('SELECT id FROM eced_browser_devices WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL FOR UPDATE',[deviceId,user.id]);
      if (!device.rowCount) throw new ForbiddenException({ code: 'ECED_DEVICE_ACCESS', message: 'Bu tarayıcı eşleştirmesini kullanma yetkiniz yok.' });
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [normalizedAccount]);
      const current = await client.query('SELECT user_id,device_id,expires_at FROM eced_account_claims WHERE normalized_account=$1 FOR UPDATE',[normalizedAccount]);
      if (current.rowCount) {
        const row = current.rows[0];
        const expires = new Date(row.expires_at).getTime();
        const sameOwner = row.user_id === user.id && row.device_id === deviceId;
        if (expires > Date.now() && !sameOwner) {
          throw new ConflictException({ code: 'ECED_ACCOUNT_CLAIMED', message: 'Bu e-ÇED hesabı başka bir kullanıcı veya cihaz tarafından rezerve edilmiş.' });
        }
        if (sameOwner) {
          const refreshed = await client.query("UPDATE eced_account_claims SET account_name=$2,last_seen=now(),expires_at=now()+interval '3 minutes' WHERE normalized_account=$1 RETURNING id",[normalizedAccount,accountName]);
          await client.query('COMMIT');
          return { claimed: true, claimId: refreshed.rows[0].id, renewed: true };
        }
        await client.query('DELETE FROM eced_account_claims WHERE normalized_account=$1',[normalizedAccount]);
      }
      const created = await client.query("INSERT INTO eced_account_claims(normalized_account,account_name,user_id,device_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '3 minutes') RETURNING id",[normalizedAccount,accountName,user.id,deviceId]);
      await client.query("INSERT INTO eced_audit_events(actor_user_id,device_id,event_type,normalized_account) VALUES($1,$2,'account_claimed',$3)",[user.id,deviceId,normalizedAccount]);
      await client.query('COMMIT');
      return { claimed: true, claimId: created.rows[0].id, renewed: false };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async releaseAccount(user: AuthUser, normalizedInput: string) {
    const normalizedAccount = normalizeAccount(clean(normalizedInput,110));
    if (!normalizedAccount) invalid('Hesap adı geçersiz.');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT id,device_id FROM eced_account_claims WHERE normalized_account=$1 AND user_id=$2 FOR UPDATE',[normalizedAccount,user.id]);
      if (!current.rowCount) throw new NotFoundException({ code: 'ECED_CLAIM_NOT_FOUND', message: 'Bu hesap için size ait etkin rezervasyon bulunamadı.' });
      await client.query('DELETE FROM eced_account_claims WHERE id=$1',[current.rows[0].id]);
      await client.query("INSERT INTO eced_audit_events(actor_user_id,device_id,event_type,normalized_account) VALUES($1,$2,'account_released',$3)",[user.id,current.rows[0].device_id,normalizedAccount]);
      await client.query('COMMIT');
      return { released: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async findDeviceForToken(token: string, client?: PoolClient, lock = false) {
    const normalized = String(token ?? '').trim();
    if (!TOKEN.test(normalized)) throw new ForbiddenException({ code: 'ECED_PAIRING_INVALID', message: 'Tarayıcı eşleştirme anahtarı geçersiz veya iptal edilmiş.' });
    const runner = client ?? this.db.pool;
    const result = await runner.query(
      'SELECT d.id,d.user_id,d.device_name,u.display_name AS owner_name FROM eced_browser_devices d JOIN users u ON u.id=d.user_id WHERE d.token_hash=$1 AND d.revoked_at IS NULL AND u.status=\\'active\\'' + (lock ? ' FOR UPDATE OF d' : ''),
      [hashToken(normalized)],
    );
    if (!result.rowCount) throw new ForbiddenException({ code: 'ECED_PAIRING_INVALID', message: 'Tarayıcı eşleştirme anahtarı geçersiz veya iptal edilmiş.' });
    return result.rows[0] as {id:string;user_id:string;device_name:string;owner_name:string};
  }
}
