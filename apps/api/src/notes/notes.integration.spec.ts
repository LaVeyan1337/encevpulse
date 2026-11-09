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
type Client={cookie:string;csrf:string};

test('Notlar API: gerçek oturum, kişisel gizlilik, arama, sürüm, arşiv ve denetim geçmişi',async()=>{
  process.loadEnvFile(resolve(process.cwd(),'../../.env'));
  const pool=new Pool({
    host:process.env.DB_HOST??'127.0.0.1',
    port:Number(process.env.DB_PORT??5432),
    database:process.env.DB_NAME??'encev_pulse_dev',
    user:process.env.DB_USER??'encev_dev',
    password:process.env.POSTGRES_PASSWORD,
    connectionTimeoutMillis:3000,
    application_name:'encev-pulse-notes-tests',
  });
  const suffix=randomBytes(5).toString('hex');
  const users=['na'+suffix,'nb'+suffix];
  const userIds:string[]=[];
  let app:Awaited<ReturnType<typeof NestFactory.create>>|null=null;

  async function api(base:string,client:Client,path:string,method='GET',body?:unknown){
    const response=await fetch(base+'/api/'+path,{
      method,
      headers:{
        Origin:ORIGIN,
        Cookie:client.cookie,
        ...(body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':client.csrf}),
      },
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    });
    const data=response.status===204?null:await response.json();
    return {response,data};
  }

  async function signIn(base:string,username:string):Promise<Client>{
    const challengeResponse=await fetch(base+'/api/auth/csrf',{
      method:'POST',
      headers:{Origin:ORIGIN,'Content-Type':'application/json'},
      body:'{}',
    });
    const challenge=await challengeResponse.json() as {csrfToken:string};
    const response=await fetch(base+'/api/auth/login',{
      method:'POST',
      headers:{Origin:ORIGIN,'Content-Type':'application/json','X-CSRF-Token':challenge.csrfToken},
      body:JSON.stringify({identifier:username,password:'Yerel-Not-Test-Parolasi-2026!'}),
    });
    const result=await response.json() as {csrfToken:string};
    assert.equal(response.status,200,JSON.stringify(result));
    return {cookie:response.headers.get('set-cookie')!.split(';',1)[0],csrf:result.csrfToken};
  }

  try{
    const role=await pool.query<{id:string}>("SELECT id FROM roles WHERE code='employee'");
    assert.ok(role.rowCount,'Employee role must exist before notes integration tests.');
    const enabled=await pool.query<{is_enabled:boolean}>("SELECT is_enabled FROM app_modules WHERE module_key='notes'");
    assert.equal(enabled.rows[0]?.is_enabled,true,'Notes module must be enabled in the migrated test database.');
    const grants=await pool.query(
      "SELECT permission_key FROM role_module_permissions WHERE role_id=$1 AND module_key='notes'",
      [role.rows[0].id],
    );
    const permissionKeys=new Set(grants.rows.map((row:{permission_key:string})=>row.permission_key));
    for(const permission of ['view','create','update','delete'])assert.ok(permissionKeys.has(permission),'Employee notes permission '+permission+' must be granted.');

    const hasher=new PasswordHasher();
    const hash=await hasher.hash('Yerel-Not-Test-Parolasi-2026!');
    for(const username of users){
      const inserted=await pool.query<{id:string}>(
        'INSERT INTO users(username,email,display_name,password_hash) VALUES($1,$2,$3,$4) RETURNING id',
        [username,username+'@encev.com.tr','Notes fixture '+username,hash],
      );
      userIds.push(inserted.rows[0].id);
      await pool.query(
        'INSERT INTO user_role_assignments(user_id,role_id,assigned_by) VALUES($1,$2,$1)',
        [inserted.rows[0].id,role.rows[0].id],
      );
    }

    app=await NestFactory.create(ApplicationModule,{logger:['error']});
    app.setGlobalPrefix('api');
    await app.listen(0,'127.0.0.1');
    const base='http://127.0.0.1:'+(app.getHttpServer().address() as AddressInfo).port;
    const [alice,bob]=await Promise.all(users.map(username=>signIn(base,username)));

    const projectResult=await api(base,alice,'tasks/projects','POST',{
      name:'Notes fixture project '+suffix,
      memberIds:[userIds[0]],
    });
    assert.equal(projectResult.response.status,201,JSON.stringify(projectResult.data));
    const projectId=projectResult.data.project.id as string;
    const taskResult=await api(base,alice,'tasks','POST',{
      title:'Notes fixture task '+suffix,
      assigneeId:userIds[0],
      projectId,
    });
    assert.equal(taskResult.response.status,201,JSON.stringify(taskResult.data));
    const taskId=taskResult.data.task.id as string;

    const created=await api(base,alice,'notes','POST',{
      title:'Kişisel denetim notu '+suffix,
      body:'Kurum görüşü ve saha kontrolü için kişisel çalışma notu.',
      tags:['ÇED','Saha','çed',''],
      projectId,
      taskId,
    });
    assert.equal(created.response.status,201,JSON.stringify(created.data));
    const note=created.data.note as {id:string;title:string;body:string;tags:string[];version:number;archivedAt:string|null};
    assert.equal(note.version,1);
    assert.deepEqual(note.tags,['ÇED','Saha'],'Turkish locale duplicate tags must be normalized without losing the first label.');
    assert.equal(note.projectId,projectId);
    assert.equal(note.taskId,taskId);

    const ownList=await api(base,alice,'notes?view=active&q='+encodeURIComponent('saha'));
    assert.equal(ownList.response.status,200);
    assert.ok(ownList.data.notes.some((entry:{id:string})=>entry.id===note.id));

    const unauthorizedTaskNote=await api(base,bob,'notes','POST',{
      title:'Başkasının görevine bağlama',
      body:'Bu bağlantı yetkisiz olmalı.',
      tags:[],
      projectId,
      taskId,
    });
    assert.equal(unauthorizedTaskNote.response.status,403,'A note cannot reference a project or task the user cannot access.');

    const otherProject=await api(base,alice,'tasks/projects','POST',{
      name:'Notes other project '+suffix,
      memberIds:[userIds[0]],
    });
    assert.equal(otherProject.response.status,201,JSON.stringify(otherProject.data));
    const mismatchedProject=await api(base,alice,'notes/'+note.id,'PATCH',{
      version:note.version,
      projectId:otherProject.data.project.id,
    });
    assert.equal(mismatchedProject.response.status,400,'A linked task and note must share the same project.');

    const privateList=await api(base,bob,'notes?view=all');
    assert.equal(privateList.response.status,200);
    assert.ok(!privateList.data.notes.some((entry:{id:string})=>entry.id===note.id),'Another employee must not see a private note.');
    const privateRead=await api(base,bob,'notes/'+note.id);
    assert.equal(privateRead.response.status,404,'Another employee must not read a private note.');
    const privateUpdate=await api(base,bob,'notes/'+note.id,'PATCH',{
      version:note.version,
      title:'Yetkisiz değiştirme',
    });
    assert.equal(privateUpdate.response.status,404,'Another employee must not update a private note.');

    const updated=await api(base,alice,'notes/'+note.id,'PATCH',{
      version:note.version,
      title:'Güncellenmiş kişisel not '+suffix,
      body:'Güncellenmiş içerik ve teslim kontrolü.',
      tags:['Teslim','Kontrol'],
    });
    assert.equal(updated.response.status,200,JSON.stringify(updated.data));
    assert.equal(updated.data.note.version,2);
    assert.equal(updated.data.note.body,'Güncellenmiş içerik ve teslim kontrolü.');
    const stale=await api(base,alice,'notes/'+note.id,'PATCH',{
      version:note.version,
      title:'Eski sürümle ezme girişimi',
    });
    assert.equal(stale.response.status,409,'Stale note edits must not overwrite newer content.');

    const invalidField=await api(base,alice,'notes/'+note.id,'PATCH',{
      version:updated.data.note.version,
      isShared:true,
    });
    assert.equal(invalidField.response.status,400,'Unknown fields must be rejected; a private note cannot be promoted by an undocumented flag.');

    const archived=await api(base,alice,'notes/'+note.id+'/archive','POST',{version:updated.data.note.version});
    assert.equal(archived.response.status,201,JSON.stringify(archived.data));
    const activeAfterArchive=await api(base,alice,'notes?view=active');
    assert.ok(!activeAfterArchive.data.notes.some((entry:{id:string})=>entry.id===note.id));
    const archivedList=await api(base,alice,'notes?view=archived');
    assert.ok(archivedList.data.notes.some((entry:{id:string})=>entry.id===note.id));

    const staleRestore=await api(base,alice,'notes/'+note.id+'/restore','POST',{version:updated.data.note.version});
    assert.equal(staleRestore.response.status,409);
    const restored=await api(base,alice,'notes/'+note.id+'/restore','POST',{version:updated.data.note.version+1});
    assert.equal(restored.response.status,201,JSON.stringify(restored.data));
    const finalRead=await api(base,alice,'notes/'+note.id);
    assert.equal(finalRead.response.status,200);
    assert.equal(finalRead.data.note.version,4);
    assert.equal(finalRead.data.note.archivedAt,null);

    const audit=await pool.query<{action:string}>(
      'SELECT action FROM user_note_audit_events WHERE note_id=$1 ORDER BY occurred_at,id',[note.id],
    );
    assert.deepEqual(audit.rows.map(row=>row.action),['created','updated','archived','restored']);
  }finally{
    if(app)await app.close();
    // CI uses a disposable PostgreSQL database; fixture rows stay there until the CI service is destroyed.
    await pool.end();
  }
});
