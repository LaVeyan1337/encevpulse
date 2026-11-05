import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import type { AuthUser } from '../auth/auth.service.js';
import {
  DOCX_FIELDS, DOCX_CONTENT_TYPE, MAX_DOCX_BYTES, fieldDefinitions,
  inspectDocxTemplate, renderDocxTemplate,
} from './docx-template.js';
import type { DocxFieldDefinition } from './docx-template.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_TYPES: Record<string,string> = {
  res:'RES',ges:'GES',maden:'Maden',yk_ges:'YK GES',storage:'Depolama',other:'Diğer',
};
const DOCUMENT_STATUSES = ['draft','in_review','approved','sent'] as const;
export type PetitionDocumentStatus = typeof DOCUMENT_STATUSES[number];

export interface PetitionUploadFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

export interface PetitionTemplateField extends DocxFieldDefinition {}

@Injectable()
export class PetitionsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async listTemplates() {
    const result = await this.db.query(
      `SELECT DISTINCT ON (family.id)
        family.id,family.name,family.description,
        version.id AS "versionId",version.version,version.file_name AS "fileName",
        version.content_sha256 AS "sha256",version.byte_size AS "byteSize",
        version.field_keys AS "fieldKeys",version.created_at AS "createdAt",
        creator.display_name AS "createdByName",
        (SELECT count(*)::int FROM petition_template_versions history WHERE history.template_id=family.id) AS "versionCount"
       FROM petition_template_families family
       JOIN petition_template_versions version ON version.template_id=family.id
       JOIN users creator ON creator.id=version.created_by
       WHERE family.is_active=true AND family.archived_at IS NULL
       ORDER BY family.id,version.version DESC`,
    );
    return {
      templates: result.rows.map(row => ({
        ...row,
        fields: fieldDefinitions(row.fieldKeys as string[]),
      })),
    };
  }

  async createTemplate(user: AuthUser, input: unknown, file: PetitionUploadFile | undefined) {
    const body = objectInput(input);
    assertKeys(body,['name','description']);
    const name = boundedText(body.name,2,160,'Şablon adı');
    const description = boundedText(body.description ?? '',0,1000,'Açıklama');
    const inspected = inspectUpload(file);
    const inspection = inspectDocxTemplate(file.buffer);

    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const family = await client.query<{id:string}>(
        `INSERT INTO petition_template_families(name,description,created_by)
         VALUES($1,$2,$3) RETURNING id`,
        [name,description,user.id],
      );
      const templateId = family.rows[0].id;
      await client.query(
        `INSERT INTO petition_template_versions(template_id,version,file_name,content_sha256,byte_size,content,field_keys,created_by)
         VALUES($1,1,$2,$3,$4,$5,$6::text[],$7)`,
        [templateId,inspected.fileName,inspection.sha256,inspection.size,file.buffer,inspection.fieldKeys,user.id],
      );
      await client.query(
        `INSERT INTO petition_template_audit_events(template_id,actor_user_id,action,details)
         VALUES($1,$2,'created',$3)`,
        [templateId,user.id,{version:1,fileName:inspected.fileName,sha256:inspection.sha256,fieldKeys:inspection.fieldKeys}],
      );
      await client.query('COMMIT');
      return { template: { id:templateId,name,description,version:1,fileName:inspected.fileName,
        sha256:inspection.sha256,byteSize:inspection.size,fieldKeys:inspection.fieldKeys,
        fields:fieldDefinitions(inspection.fieldKeys) } };
    } catch(error) {
      await client.query('ROLLBACK').catch(()=>undefined);
      if ((error as {code?:string}).code === '23505') {
        throw new ConflictException({code:'PETITION_TEMPLATE_NAME_EXISTS',message:'Bu adla etkin bir dilekçe şablonu zaten var. Mevcut şablona yeni sürüm yükleyin.'});
      }
      throw error;
    } finally { client.release(); }
  }

  async listTemplateVersions(templateId: string) {
    assertUuid(templateId,'Şablon');
    const result = await this.db.query(
      `SELECT version.id,version.version,version.file_name AS "fileName",
        version.content_sha256 AS "sha256",version.byte_size AS "byteSize",
        version.field_keys AS "fieldKeys",version.created_at AS "createdAt",
        creator.display_name AS "createdByName"
       FROM petition_template_versions version
       JOIN petition_template_families family ON family.id=version.template_id
       JOIN users creator ON creator.id=version.created_by
       WHERE version.template_id=$1
       ORDER BY version.version DESC`,
      [templateId],
    );
    if (!result.rowCount) throw new NotFoundException({code:'PETITION_TEMPLATE_NOT_FOUND',message:'Dilekçe şablonu bulunamadı.'});
    return {versions:result.rows.map(row=>({...row,fields:fieldDefinitions(row.fieldKeys as string[])}))};
  }

  async downloadTemplateVersion(templateId:string,versionId:string) {
    assertUuid(templateId,'Şablon');
    assertUuid(versionId,'Şablon sürümü');
    const result=await this.db.query<{content:Buffer;fileName:string;byteSize:number}>(
      `SELECT version.content,version.file_name AS "fileName",version.byte_size AS "byteSize"
       FROM petition_template_versions version
       JOIN petition_template_families family ON family.id=version.template_id
       WHERE family.id=$1 AND version.id=$2`,
      [templateId,versionId],
    );
    if(!result.rowCount)throw new NotFoundException({code:'PETITION_TEMPLATE_VERSION_NOT_FOUND',message:'Şablon sürümü bulunamadı.'});
    return result.rows[0];
  }

  async createTemplateVersion(user: AuthUser, templateId: string, file: PetitionUploadFile | undefined) {
    assertUuid(templateId,'Şablon');
    const inspected = inspectUpload(file);
    const inspection = inspectDocxTemplate(file.buffer);
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const family = await client.query<{id:string;name:string;description:string;is_active:boolean}>(
        `SELECT id,name,description,is_active
         FROM petition_template_families
         WHERE id=$1 AND archived_at IS NULL
         FOR UPDATE`,
        [templateId],
      );
      if (!family.rowCount || !family.rows[0].is_active) {
        throw new NotFoundException({code:'PETITION_TEMPLATE_NOT_FOUND',message:'Etkin dilekçe şablonu bulunamadı.'});
      }
      const latest = await client.query<{version:number}>(
        'SELECT COALESCE(max(version),0)::int AS version FROM petition_template_versions WHERE template_id=$1',
        [templateId],
      );
      const version = latest.rows[0].version + 1;
      await client.query(
        `INSERT INTO petition_template_versions(template_id,version,file_name,content_sha256,byte_size,content,field_keys,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7::text[],$8)`,
        [templateId,version,inspected.fileName,inspection.sha256,inspection.size,file.buffer,inspection.fieldKeys,user.id],
      );
      await client.query(
        `UPDATE petition_template_families SET updated_at=now() WHERE id=$1`,
        [templateId],
      );
      await client.query(
        `INSERT INTO petition_template_audit_events(template_id,actor_user_id,action,details)
         VALUES($1,$2,'version_added',$3)`,
        [templateId,user.id,{version,fileName:inspected.fileName,sha256:inspection.sha256,fieldKeys:inspection.fieldKeys}],
      );
      await client.query('COMMIT');
      return { template: { id:templateId,name:family.rows[0].name,description:family.rows[0].description,
        version,fileName:inspected.fileName,sha256:inspection.sha256,byteSize:inspection.size,
        fieldKeys:inspection.fieldKeys,fields:fieldDefinitions(inspection.fieldKeys) } };
    } catch(error) {
      await client.query('ROLLBACK').catch(()=>undefined);
      throw error;
    } finally { client.release(); }
  }

  async archiveTemplate(user: AuthUser, templateId: string) {
    assertUuid(templateId,'Şablon');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<{id:string;name:string}>(
        `SELECT id,name FROM petition_template_families
         WHERE id=$1 AND is_active=true AND archived_at IS NULL FOR UPDATE`,
        [templateId],
      );
      if (!current.rowCount) throw new NotFoundException({code:'PETITION_TEMPLATE_NOT_FOUND',message:'Etkin şablon bulunamadı.'});
      await client.query(
        'UPDATE petition_template_families SET is_active=false,archived_at=now(),updated_at=now() WHERE id=$1',
        [templateId],
      );
      await client.query(
        `INSERT INTO petition_template_audit_events(template_id,actor_user_id,action,details)
         VALUES($1,$2,'archived',$3)`,
        [templateId,user.id,{name:current.rows[0].name}],
      );
      await client.query('COMMIT');
      return {templateId,archived:true};
    } catch(error) {
      await client.query('ROLLBACK').catch(()=>undefined);
      throw error;
    } finally { client.release(); }
  }

  async listDocuments(user: AuthUser, query: Record<string,string|undefined>) {
    const status = query.status ?? 'active';
    if (!['active','draft','in_review','approved','sent','archived'].includes(status)) throw invalid('Dilekçe durumu filtresi geçersiz.');
    const limit = query.limit === undefined ? 80 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid('Dilekçe liste sınırı geçersiz.');
    const statusClause = status === 'active'
      ? 'd.archived_at IS NULL'
      : status === 'archived'
        ? 'd.archived_at IS NOT NULL'
        : 'd.archived_at IS NULL AND d.status=$2';
    const params = status === 'active' || status === 'archived' ? [user.id,limit] : [user.id,status,limit];
    const result = await this.db.query(
      `SELECT d.id,d.project_id AS "projectId",p.name AS "projectName",
        d.template_version_id AS "templateVersionId",family.id AS "templateId",
        family.name AS "templateName",version.version AS "templateVersion",
        d.title,d.file_name AS "fileName",d.content_sha256 AS "sha256",
        d.byte_size AS "byteSize",d.status,d.version,d.created_at AS "createdAt",
        d.updated_at AS "updatedAt",creator.display_name AS "creatorName"
       FROM petition_documents d
       JOIN projects p ON p.id=d.project_id
       JOIN petition_template_versions version ON version.id=d.template_version_id
       JOIN petition_template_families family ON family.id=version.template_id
       JOIN users creator ON creator.id=d.created_by
       WHERE ${statusClause}
         AND (p.created_by=$1 OR p.owner_user_id=$1 OR EXISTS(
           SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$1
         ))
       ORDER BY d.updated_at DESC,d.id
       LIMIT $${params.length}`,
      params,
    );
    return {documents:result.rows};
  }

  async createDocument(user: AuthUser, input: unknown) {
    const body = objectInput(input);
    assertKeys(body,['projectId','templateVersionId','title','fileName','fields']);
    assertUuid(body.projectId,'Proje');
    assertUuid(body.templateVersionId,'Şablon sürümü');
    const projectId = body.projectId as string;
    const titleInput = body.title === undefined ? '' : boundedText(body.title,0,180,'Belge başlığı');
    const fileNameInput = body.fileName === undefined ? '' : boundedText(body.fileName,0,180,'Dosya adı');
    const userFields = objectInput(body.fields ?? {});
    if (Object.keys(userFields).length > 40) throw invalid('Dilekçe alan sayısı sınırı aşıldı.');

    const projectResult = await this.db.query<any>(
      `SELECT p.id,p.name,p.description,p.project_type AS "projectType",
        p.starts_on::text AS "startsOn",p.target_on::text AS "targetOn",p.created_at AS "createdAt",
        owner.display_name AS "ownerName",
        ced.file_number AS "fileNumber",ced.eced_reference AS "ecedReference"
       FROM projects p
       JOIN users owner ON owner.id=p.owner_user_id
       LEFT JOIN LATERAL (
         SELECT file_number,eced_reference
         FROM ced_cases
         WHERE project_id=p.id AND archived_at IS NULL
         ORDER BY updated_at DESC
         LIMIT 1
       ) ced ON true
       WHERE p.id=$1 AND p.archived_at IS NULL AND p.status<>'archived'
         AND (p.created_by=$2 OR p.owner_user_id=$2 OR EXISTS(
           SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$2
         ))`,
      [projectId,user.id],
    );
    if (!projectResult.rowCount) throw new NotFoundException({code:'PETITION_PROJECT_NOT_FOUND',message:'Proje bulunamadı veya erişim yetkiniz yok.'});
    const project = projectResult.rows[0];

    const templateResult = await this.db.query<any>(
      `SELECT version.id,version.version,version.file_name AS "fileName",
        version.content_sha256 AS "sha256",version.content,version.field_keys AS "fieldKeys",
        family.id AS "templateId",family.name AS "templateName",family.is_active AS "templateActive"
       FROM petition_template_versions version
       JOIN petition_template_families family ON family.id=version.template_id
       WHERE version.id=$1 AND family.is_active=true AND family.archived_at IS NULL
         AND version.version=(
           SELECT max(latest.version) FROM petition_template_versions latest WHERE latest.template_id=family.id
         )`,
      [body.templateVersionId],
    );
    if (!templateResult.rowCount) throw new NotFoundException({code:'PETITION_TEMPLATE_VERSION_NOT_FOUND',message:'Etkin şablon sürümü bulunamadı. Şablon listesini yenileyin.'});
    const template = templateResult.rows[0];
    const fieldKeys = template.fieldKeys as string[];
    const suppliedKeys = Object.keys(userFields);
    const userAllowed = new Set(fieldKeys.filter(key => DOCX_FIELDS[key]?.source === 'user'));
    if (suppliedKeys.some(key => !userAllowed.has(key))) throw invalid('Şablonda bulunmayan bir dilekçe alanı gönderildi.');

    const values:Record<string,string> = {
      DOCUMENT_DATE:todayLabel(),
      PROJECT_NAME:String(project.name ?? ''),
      PROJECT_DESCRIPTION:String(project.description ?? ''),
      PROJECT_TYPE:PROJECT_TYPES[String(project.projectType)] ?? String(project.projectType ?? ''),
      PROJECT_OWNER:String(project.ownerName ?? ''),
      PROJECT_START_DATE:dateLabel(project.startsOn),
      PROJECT_TARGET_DATE:dateLabel(project.targetOn),
      PROJECT_FILE_NUMBER:String(project.fileNumber ?? ''),
      ECED_REFERENCE:String(project.ecedReference ?? ''),
      AUTHOR_NAME:user.displayName,
      AUTHOR_TITLE:user.jobTitle ?? '',
      AUTHOR_DEPARTMENT:user.department ?? '',
      AUTHOR_EMAIL:user.email,
      RECIPIENT_NAME:'',
      INSTITUTION_NAME:'',
      CONTACT_PERSON:'',
      PETITION_SUBJECT:'',
      PETITION_BODY:'',
      REFERENCE_NUMBER:'',
    };
    for (const key of userAllowed) {
      const value = userFields[key];
      if (value !== undefined && typeof value !== 'string') throw invalid(`${DOCX_FIELDS[key].label} metin olmalıdır.`);
      const text = typeof value === 'string' ? value.trim() : '';
      const maximum = key === 'PETITION_BODY' ? 30_000 : 1_000;
      if (text.length > maximum) throw invalid(`${DOCX_FIELDS[key].label} en fazla ${maximum.toLocaleString('tr-TR')} karakter olabilir.`);
      values[key] = text;
    }

    let rendered;
    try {
      rendered = renderDocxTemplate(template.content as Buffer,values);
    } catch(error) {
      if (error instanceof Error) throw invalid(error.message);
      throw error;
    }

    const title = titleInput || values.PETITION_SUBJECT || `Dilekçe · ${project.name}`;
    const baseName = fileNameInput ? fileNameInput.replace(/\.docx$/i,'') : `Dilekce_${project.name}_${todayIso()}`;
    const fileName = safeFileName(baseName) + '.docx';
    const storedFields = Object.fromEntries([...userAllowed].map(key=>[key,values[key]]));
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO petition_documents(
          project_id,template_version_id,title,file_name,content_sha256,byte_size,content,preview_text,
          fields_data,status,created_by,updated_by
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'draft',$10,$10)
        RETURNING id,project_id AS "projectId",template_version_id AS "templateVersionId",
          title,file_name AS "fileName",content_sha256 AS "sha256",byte_size AS "byteSize",
          preview_text AS "previewText",status,version,created_at AS "createdAt",updated_at AS "updatedAt"`,
        [projectId,template.id,title,fileName,rendered.sha256,rendered.size,rendered.content,
          rendered.previewText,JSON.stringify(storedFields),user.id],
      );
      const document = inserted.rows[0];
      await client.query(
        `INSERT INTO petition_document_audit_events(document_id,actor_user_id,action,details)
         VALUES($1,$2,'created',$3)`,
        [document.id,user.id,{projectId,templateId:template.templateId,templateVersion:template.version,
          templateSha256:template.sha256,outputSha256:rendered.sha256,fieldKeys}],
      );
      await client.query('COMMIT');
      return {document:{...document,projectName:project.name,templateName:template.templateName,
        templateVersion:template.version}};
    } catch(error) {
      await client.query('ROLLBACK').catch(()=>undefined);
      throw error;
    } finally { client.release(); }
  }

  async getDocument(user: AuthUser, documentId: string) {
    assertUuid(documentId,'Dilekçe');
    const result = await this.db.query(
      `SELECT d.id,d.project_id AS "projectId",p.name AS "projectName",
        d.template_version_id AS "templateVersionId",family.name AS "templateName",
        version.version AS "templateVersion",d.title,d.file_name AS "fileName",
        d.content_sha256 AS "sha256",d.byte_size AS "byteSize",d.preview_text AS "previewText",
        d.fields_data AS fields,d.status,d.version,d.created_at AS "createdAt",
        d.updated_at AS "updatedAt",creator.display_name AS "creatorName"
       FROM petition_documents d
       JOIN projects p ON p.id=d.project_id
       JOIN petition_template_versions version ON version.id=d.template_version_id
       JOIN petition_template_families family ON family.id=version.template_id
       JOIN users creator ON creator.id=d.created_by
       WHERE d.id=$1 AND d.archived_at IS NULL
         AND (p.created_by=$2 OR p.owner_user_id=$2 OR EXISTS(
           SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$2
         ))`,
      [documentId,user.id],
    );
    if (!result.rowCount) throw new NotFoundException({code:'PETITION_DOCUMENT_NOT_FOUND',message:'Dilekçe kaydı bulunamadı.'});
    return {document:result.rows[0]};
  }

  async downloadDocument(user: AuthUser, documentId: string) {
    assertUuid(documentId,'Dilekçe');
    const result = await this.db.query<{content:Buffer;fileName:string;byteSize:number}>(
      `SELECT d.content,d.file_name AS "fileName",d.byte_size AS "byteSize"
       FROM petition_documents d
       JOIN projects p ON p.id=d.project_id
       WHERE d.id=$1 AND d.archived_at IS NULL
         AND (p.created_by=$2 OR p.owner_user_id=$2 OR EXISTS(
           SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$2
         ))`,
      [documentId,user.id],
    );
    if (!result.rowCount) throw new NotFoundException({code:'PETITION_DOCUMENT_NOT_FOUND',message:'Dilekçe kaydı bulunamadı.'});
    await this.db.query(
      `INSERT INTO petition_document_audit_events(document_id,actor_user_id,action,details)
       VALUES($1,$2,'downloaded',$3)`,
      [documentId,user.id,{fileName:result.rows[0].fileName}],
    );
    return result.rows[0];
  }

  async updateDocumentStatus(user: AuthUser, documentId: string, input: unknown) {
    assertUuid(documentId,'Dilekçe');
    const body = objectInput(input);
    assertKeys(body,['status','version','note']);
    if (typeof body.status !== 'string' || !DOCUMENT_STATUSES.includes(body.status as PetitionDocumentStatus)) {
      throw invalid('Dilekçe durumu geçersiz.');
    }
    if (!Number.isInteger(body.version) || Number(body.version) < 1) throw invalid('Dilekçe sürümü geçersiz.');
    const nextStatus = body.status as PetitionDocumentStatus;
    const note = boundedText(body.note ?? '',0,1000,'İşlem notu');
    const approver = user.roles.includes('system_admin') || user.roles.includes('process_owner') || user.roles.includes('document_steward');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<any>(
        `SELECT d.id,d.project_id AS "projectId",d.status,d.version,d.created_by AS "createdBy",
          p.created_by AS "projectCreator",p.owner_user_id AS "projectOwner"
         FROM petition_documents d JOIN projects p ON p.id=d.project_id
         WHERE d.id=$1 AND d.archived_at IS NULL
           AND (p.created_by=$2 OR p.owner_user_id=$2 OR EXISTS(
             SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$2
           ))
         FOR UPDATE OF d`,
        [documentId,user.id],
      );
      if (!current.rowCount) throw new NotFoundException({code:'PETITION_DOCUMENT_NOT_FOUND',message:'Dilekçe kaydı bulunamadı.'});
      const old = current.rows[0];
      if (Number(old.version) !== Number(body.version)) {
        throw new ConflictException({code:'PETITION_DOCUMENT_VERSION_CONFLICT',message:'Dilekçe başka bir kullanıcı tarafından değiştirilmiş. Listeyi yenileyin.'});
      }
      const transitionAllowed =
        (old.status === 'draft' && nextStatus === 'in_review') ||
        (old.status === 'in_review' && nextStatus === 'draft' && approver) ||
        (old.status === 'in_review' && nextStatus === 'approved' && approver) ||
        (old.status === 'approved' && nextStatus === 'sent' && approver);
      if (!transitionAllowed) throw new ForbiddenException({code:'PETITION_STATUS_TRANSITION_DENIED',message:'Bu durum değişikliğine yetkiniz yok veya işlem sırası geçersiz.'});
      if (old.status === 'draft' && nextStatus === 'in_review' &&
          old.createdBy !== user.id && !approver) {
        throw new ForbiddenException({code:'PETITION_SUBMIT_DENIED',message:'Yalnız belgeyi oluşturan veya süreç sorumlusu incelemeye gönderebilir.'});
      }
      const updated = await client.query(
        `UPDATE petition_documents
         SET status=$1,updated_by=$2,updated_at=now(),version=version+1
         WHERE id=$3 AND version=$4
         RETURNING id,status,version,updated_at AS "updatedAt"`,
        [nextStatus,user.id,documentId,old.version],
      );
      if (!updated.rowCount) throw new ConflictException({code:'PETITION_DOCUMENT_VERSION_CONFLICT',message:'Dilekçe değişmiş. Yenileyip tekrar deneyin.'});
      await client.query(
        `INSERT INTO petition_document_audit_events(document_id,actor_user_id,action,details)
         VALUES($1,$2,'status_changed',$3)`,
        [documentId,user.id,{from:old.status,to:nextStatus,note}],
      );
      await client.query('COMMIT');
      return {document:updated.rows[0]};
    } catch(error) {
      await client.query('ROLLBACK').catch(()=>undefined);
      throw error;
    } finally { client.release(); }
  }
}

function inspectUpload(file: PetitionUploadFile | undefined): {fileName:string} {
  if (!file || !Buffer.isBuffer(file.buffer)) throw invalid('Bir Word şablonu seçin.');
  if (file.size < 22 || file.size > MAX_DOCX_BYTES || file.buffer.length !== file.size) {
    throw invalid('Word şablonu boş olamaz ve 12 MB sınırını aşamaz.');
  }
  if (!file.originalname.toLocaleLowerCase('tr-TR').endsWith('.docx')) throw invalid('Yalnızca .docx Word dosyası yüklenebilir.');
  const fileName = safeFileName(file.originalname);
  if (!fileName.toLocaleLowerCase('tr-TR').endsWith('.docx')) throw invalid('Word dosya adı geçersiz.');
  return {fileName};
}
function objectInput(value: unknown): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('Gönderilen veriler geçersiz.');
  return value as Record<string,unknown>;
}
function assertKeys(value: Record<string,unknown>,allowed:string[]) {
  if (Object.keys(value).some(key=>!allowed.includes(key))) throw invalid('Gönderilen alanları kontrol edin.');
}
function assertUuid(value: unknown,label:string) {
  if (typeof value !== 'string' || !UUID.test(value)) throw invalid(`${label} kimliği geçersiz.`);
}
function boundedText(value: unknown,min:number,max:number,label:string):string {
  if (typeof value !== 'string') throw invalid(`${label} geçersiz.`);
  const text=value.trim();
  if (text.length<min || text.length>max) throw invalid(`${label} ${min>0?min+'–':''}${max} karakter arasında olmalıdır.`);
  return text;
}
function safeFileName(value:string):string {
  const safe=value.normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ')
    .trim().replace(/[. ]+$/,'').slice(0,170);
  return safe || 'Dilekce';
}
function todayIso():string {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function todayLabel():string {
  return new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date());
}
function dateLabel(value:string|null|undefined):string {
  if (!value) return '';
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
}
function invalid(message:string) {
  return new BadRequestException({code:'INVALID_PETITION_INPUT',message});
}
