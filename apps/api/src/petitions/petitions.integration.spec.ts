import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { ApplicationModule } from '../application.module.js';
import { PasswordHasher } from '../auth/password-hasher.js';

const ORIGIN=process.env.APP_ORIGIN??'http://127.0.0.1:5173';
const PASSWORD='Petition-Integration-Test-2026!';
type Client={cookie:string;csrf:string};
type ZipInput={name:string;content:string};

const crcTable=new Uint32Array(256);
for(let n=0;n<256;n++){let value=n;for(let bit=0;bit<8;bit++)value=(value&1)?(0xedb88320^(value>>>1)):(value>>>1);crcTable[n]=value>>>0;}
function crc32(data:Buffer){let crc=0xffffffff;for(const byte of data)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}

function makeZip(entries:ZipInput[]):Buffer{
  const localParts:Buffer[]=[];const centralParts:Buffer[]=[];let localOffset=0;
  for(const entry of entries){
    const name=Buffer.from(entry.name,'utf8'),data=Buffer.from(entry.content,'utf8');
    const compressed=deflateRawSync(data),crc=crc32(data);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);
    local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);
    local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
    localParts.push(local,name,compressed);
    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
    central.writeUInt16LE(0x0800,8);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);
    central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);
    central.writeUInt16LE(name.length,28);central.writeUInt32LE(localOffset,42);
    centralParts.push(central,name);
    localOffset+=local.length+name.length+compressed.length;
  }
  const local=Buffer.concat(localParts),central=Buffer.concat(centralParts),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(central.length,12);end.writeUInt32LE(local.length,16);
  return Buffer.concat([local,central,end]);
}

function makeDocx():Buffer{
  const documentXml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+
    '<w:p><w:r><w:t>{{PROJECT_NAME}}</w:t></w:r></w:p>'+
    '<w:p><w:r><w:t>{{DOCUMENT_DATE}}</w:t></w:r></w:p>'+
    '<w:p><w:r><w:t>Sayın {{RECIPIENT_NAME}}</w:t></w:r></w:p>'+
    '<w:p><w:r><w:t>{{INSTITUTION_NAME}}</w:t></w:r></w:p>'+
    '<w:p><w:r><w:t>{{PETITION_SUBJECT}}</w:t></w:r></w:p>'+
    '<w:p><w:r><w:t>{{PETITION_BODY}}</w:t></w:r></w:p>'+
    '</w:body></w:document>';
  return makeZip([
    {name:'[Content_Types].xml',content:'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'},
    {name:'word/document.xml',content:documentXml},
  ]);
}

test('Dilekçe API: ortak DOCX şablonu, sürüm, proje verisi, onay ve indirme',async()=>{
  process.loadEnvFile(resolve(process.cwd(),'../../.env'));
  const pool=new Pool({
    host:process.env.DB_HOST??'127.0.0.1',
    port:Number(process.env.DB_PORT??5432),
    database:process.env.DB_NAME??'encev_pulse_dev',
    user:process.env.DB_USER??'encev_dev',
    password:process.env.POSTGRES_PASSWORD,
    connectionTimeoutMillis:3000,
    application_name:'encev-pulse-petitions-integration',
  });
  const suffix=randomBytes(5).toString('hex');
  const employeeName='pe'+suffix,ownerName='po'+suffix,outsiderName='px'+suffix;
  const employeeEmail=employeeName+'@encev.com.tr',ownerEmail=ownerName+'@encev.com.tr',outsiderEmail=outsiderName+'@encev.com.tr';
  const hasher=new PasswordHasher();
  const hash=await hasher.hash(PASSWORD);
  const userIds:string[]=[];
  const projectIds:string[]=[];
  const familyIds:string[]=[];
  const documentIds:string[]=[];
  let app:Awaited<ReturnType<typeof NestFactory.create>>|null=null;

  async function api(base:string,client:Client,path:string,method='GET',body?:unknown){
    const response=await fetch(base+'/api/'+path,{
      method,
      headers:{
        Origin:ORIGIN,Cookie:client.cookie,
        ...(body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':client.csrf}),
      },
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    });
    const data=response.status===204?null:response.headers.get('content-type')?.includes('application/json')?await response.json():null;
    return {response,data};
  }

  async function upload(base:string,client:Client,path:string,fields:Record<string,string>,bytes:Buffer){
    const form=new FormData();
    for(const [key,value] of Object.entries(fields))form.append(key,value);
    form.append('file',new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),'Kurum_Dilekcesi.docx');
    const response=await fetch(base+'/api/'+path,{
      method:'POST',
      headers:{Origin:ORIGIN,Cookie:client.cookie,'X-CSRF-Token':client.csrf},
      body:form,
    });
    return {response,data:await response.json()};
  }

  async function signIn(base:string,username:string):Promise<Client>{
    const challengeResponse=await fetch(base+'/api/auth/csrf',{
      method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:'{}',
    });
    const challenge=await challengeResponse.json() as {csrfToken:string};
    const response=await fetch(base+'/api/auth/login',{
      method:'POST',
      headers:{Origin:ORIGIN,'Content-Type':'application/json','X-CSRF-Token':challenge.csrfToken},
      body:JSON.stringify({identifier:username,password:PASSWORD}),
    });
    const result=await response.json() as {csrfToken:string};
    assert.equal(response.status,200);
    return {cookie:response.headers.get('set-cookie')!.split(';',1)[0],csrf:result.csrfToken};
  }

  try{
    const roleResult=await pool.query<{id:string;code:string}>(
      "SELECT id,code FROM roles WHERE code=ANY($1::text[])",
      [['employee','process_owner']],
    );
    const roleIds=new Map(roleResult.rows.map(row=>[row.code,row.id]));
    assert.equal(roleIds.size,2);

    for(const [username,email,roleCode] of [
      [employeeName,employeeEmail,'employee'],
      [ownerName,ownerEmail,'process_owner'],
      [outsiderName,outsiderEmail,'employee'],
    ] as const){
      const user=await pool.query<{id:string}>(
        'INSERT INTO users(username,email,display_name,password_hash) VALUES($1,$2,$3,$4) RETURNING id',
        [username,email,'Petition test '+username,hash],
      );
      userIds.push(user.rows[0].id);
      await pool.query(
        'INSERT INTO user_role_assignments(user_id,role_id,assigned_by) VALUES($1,$2,$1)',
        [user.rows[0].id,roleIds.get(roleCode)],
      );
    }

    const project=await pool.query<{id:string}>(
      `INSERT INTO projects(name,description,status,project_type,created_by,owner_user_id,starts_on,target_on)
       VALUES($1,$2,'active','ges',$3,$3,'2026-03-01','2027-03-01') RETURNING id`,
      ['Petition project '+suffix,'Integration test project',userIds[0]],
    );
    projectIds.push(project.rows[0].id);
    await pool.query(
      'INSERT INTO project_members(project_id,user_id,added_by) VALUES($1,$2,$2)',
      [projectIds[0],userIds[1]],
    );

    app=await NestFactory.create(ApplicationModule,{logger:['error']});
    app.setGlobalPrefix('api');
    await app.listen(0,'127.0.0.1');
    const base='http://127.0.0.1:'+(app.getHttpServer().address() as AddressInfo).port;
    const [employee,owner,outsider]=await Promise.all([
      signIn(base,employeeName),signIn(base,ownerName),signIn(base,outsiderName),
    ]);

    const source=makeDocx();
    const uploaded=await upload(base,owner,'petitions/templates',{
      name:'CI Kurum Dilekçesi '+suffix,
      description:'Sentetik DOCX entegrasyon şablonu',
    },source);
    assert.equal(uploaded.response.status,201,JSON.stringify(uploaded.data));
    const template=uploaded.data.template as {id:string;versionId:string;version:number;fieldKeys:string[]};
    familyIds.push(template.id);
    assert.equal(template.version,1);
    assert.ok(template.fieldKeys.includes('PROJECT_NAME'));
    assert.ok(template.fieldKeys.includes('PETITION_BODY'));

    const employeeTemplateUpload=await upload(base,employee,'petitions/templates',{
      name:'Yetkisiz şablon '+suffix,description:'Bu yükleme reddedilmelidir',
    },source);
    assert.equal(employeeTemplateUpload.response.status,403);

    const versions=await api(base,owner,'petitions/templates/'+template.id+'/versions');
    assert.equal(versions.response.status,200);
    assert.equal(versions.data.versions.length,1);

    const invalidDraft=await api(base,employee,'petitions/documents','POST',{
      projectId:projectIds[0],templateVersionId:template.versionId,
      fields:{RECIPIENT_NAME:'Çevre Müdürlüğü',INSTITUTION_NAME:'Çevre Müdürlüğü',PETITION_SUBJECT:'Test konusu'},
    });
    assert.equal(invalidDraft.response.status,400);
    assert.match(invalidDraft.data.message,/Dilekçe metni/);

    const created=await api(base,employee,'petitions/documents','POST',{
      projectId:projectIds[0],templateVersionId:template.versionId,
      title:'ÇED kurum görüşü talebi',
      fields:{
        RECIPIENT_NAME:'Çevre, Şehircilik ve İklim Değişikliği İl Müdürlüğüne',
        INSTITUTION_NAME:'Test İl Müdürlüğü',
        PETITION_SUBJECT:'GES projesi kurum görüşü',
        PETITION_BODY:'Proje için kurum görüşünüzün iletilmesini arz ederiz.\nEkler sunulmuştur.',
      },
    });
    assert.equal(created.response.status,201,JSON.stringify(created.data));
    const document=created.data.document as {id:string;status:string;previewText:string;fileName:string;byteSize:number;version:number};
    documentIds.push(document.id);
    assert.equal(document.status,'draft');
    assert.match(document.previewText,/Petition project/);
    assert.match(document.previewText,/GES projesi kurum görüşü/);
    assert.match(document.previewText,/Ekler sunulmuştur/);
    assert.ok(document.byteSize>100);
    assert.match(document.fileName,/\.docx$/);

    const outsiderRead=await api(base,outsider,'petitions/documents/'+document.id);
    assert.equal(outsiderRead.response.status,404,'Başka projenin dilekçesi gösterilmemeli.');
    const employeeApproval=await api(base,employee,'petitions/documents/'+document.id+'/status','PATCH',{
      status:'approved',version:1,note:'',
    });
    assert.equal(employeeApproval.response.status,403,'Çalışan rolü belge onayı/değişiklik izni taşımaz.');

    const download=await fetch(base+'/api/petitions/documents/'+document.id+'/download',{
      headers:{Origin:ORIGIN,Cookie:employee.cookie},
    });
    assert.equal(download.status,200);
    assert.equal(download.headers.get('content-type'),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const downloaded=Buffer.from(await download.arrayBuffer());
    assert.ok(downloaded.length>100);
    assert.ok(downloaded.includes(Buffer.from('Petition project '+suffix)));

    const review=await api(base,owner,'petitions/documents/'+document.id+'/status','PATCH',{
      status:'in_review',version:1,note:'Süreç sahibi incelemesine gönderildi.',
    });
    assert.equal(review.response.status,200,JSON.stringify(review.data));
    assert.equal(review.data.document.status,'in_review');
    const approve=await api(base,owner,'petitions/documents/'+document.id+'/status','PATCH',{
      status:'approved',version:2,note:'İçerik kontrol edildi.',
    });
    assert.equal(approve.response.status,200,JSON.stringify(approve.data));
    assert.equal(approve.data.document.status,'approved');
    const sent=await api(base,owner,'petitions/documents/'+document.id+'/status','PATCH',{
      status:'sent',version:3,note:'Gönderim kullanıcı tarafından teyit edildi.',
    });
    assert.equal(sent.response.status,200,JSON.stringify(sent.data));
    assert.equal(sent.data.document.status,'sent');

    const secondVersion=await upload(base,owner,'petitions/templates/'+template.id+'/versions',{},source);
    assert.equal(secondVersion.response.status,201,JSON.stringify(secondVersion.data));
    assert.equal(secondVersion.data.template.version,2);
    assert.notEqual(secondVersion.data.template.versionId,template.versionId);

    const oldVersionDraft=await api(base,employee,'petitions/documents','POST',{
      projectId:projectIds[0],templateVersionId:template.versionId,
      fields:{
        RECIPIENT_NAME:'Müdürlük',INSTITUTION_NAME:'Kurum',
        PETITION_SUBJECT:'Eski sürüm denemesi',PETITION_BODY:'Eski şablon kullanılamamalı.',
      },
    });
    assert.equal(oldVersionDraft.response.status,404,'Yeni belge oluştururken eski şablon sürümü seçilememeli.');

    const list=await api(base,employee,'petitions/documents?status=active&limit=80');
    assert.equal(list.response.status,200);
    assert.ok(list.data.documents.some((entry:{id:string})=>entry.id===document.id));

    const archived=await api(base,owner,'petitions/templates/'+template.id+'/archive','POST',{});
    assert.equal(archived.response.status,200);
    const templatesAfterArchive=await api(base,employee,'petitions/templates');
    assert.equal(templatesAfterArchive.response.status,200);
    assert.ok(!templatesAfterArchive.data.templates.some((entry:{id:string})=>entry.id===template.id));
    const existingDocument=await api(base,employee,'petitions/documents/'+document.id);
    assert.equal(existingDocument.response.status,200,'Önceden üretilen belge, şablon arşivlense de korunur.');
    const audit=await pool.query<{count:string}>(
      'SELECT count(*)::text AS count FROM petition_document_audit_events WHERE document_id=$1',[document.id],
    );
    assert.equal(audit.rows[0].count,'5','Oluşturma, indirme ve üç durum değişikliği denetim kaydına yazılmalı.');
  }finally{
    if(app)await app.close();
    const cleanup=await pool.connect();
    try{
      await cleanup.query('BEGIN');
      if(documentIds.length){
        await cleanup.query('ALTER TABLE petition_document_audit_events DISABLE TRIGGER petition_document_audit_events_append_only');
        await cleanup.query('DELETE FROM petition_document_audit_events WHERE document_id=ANY($1::uuid[])',[documentIds]);
        await cleanup.query('DELETE FROM petition_documents WHERE id=ANY($1::uuid[])',[documentIds]);
        await cleanup.query('ALTER TABLE petition_document_audit_events ENABLE TRIGGER petition_document_audit_events_append_only');
      }
      if(familyIds.length){
        await cleanup.query('ALTER TABLE petition_template_audit_events DISABLE TRIGGER petition_template_audit_events_append_only');
        await cleanup.query('DELETE FROM petition_template_audit_events WHERE template_id=ANY($1::uuid[])',[familyIds]);
        await cleanup.query('ALTER TABLE petition_template_audit_events ENABLE TRIGGER petition_template_audit_events_append_only');
        await cleanup.query('DELETE FROM petition_template_versions WHERE template_id=ANY($1::uuid[])',[familyIds]);
        await cleanup.query('DELETE FROM petition_template_families WHERE id=ANY($1::uuid[])',[familyIds]);
      }
      if(projectIds.length){
        await cleanup.query('DELETE FROM project_members WHERE project_id=ANY($1::uuid[])',[projectIds]);
        await cleanup.query('DELETE FROM projects WHERE id=ANY($1::uuid[])',[projectIds]);
      }
      if(userIds.length){
        await cleanup.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[userIds]);
        await cleanup.query('DELETE FROM user_role_assignments WHERE user_id=ANY($1::uuid[])',[userIds]);
        await cleanup.query('ALTER TABLE auth_audit_events DISABLE TRIGGER auth_audit_events_append_only');
        await cleanup.query('DELETE FROM auth_audit_events WHERE actor_user_id=ANY($1::uuid[]) OR target_user_id=ANY($1::uuid[])',[userIds]);
        await cleanup.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[userIds]);
        await cleanup.query('ALTER TABLE auth_audit_events ENABLE TRIGGER auth_audit_events_append_only');
      }
      await cleanup.query('COMMIT');
    }catch(error){
      await cleanup.query('ROLLBACK');
      throw error;
    }finally{
      cleanup.release();
      await pool.end();
    }
  }
});
