import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { ApplicationModule } from '../application.module.js';
import { PasswordHasher } from '../auth/password-hasher.js';

const ORIGIN=process.env.APP_ORIGIN??'http://127.0.0.1:5173';
const PASSWORD='Yerel-Eced-Test-Parolasi-2026!';

type Client={cookie:string;csrf:string};

test('e-ÇED API: pairing tokens, allowlisted browser reports, scoped claims and revocation',async()=>{
  process.loadEnvFile(resolve(process.cwd(),'../../.env'));
  const pool=new Pool({
    host:process.env.DB_HOST??'127.0.0.1',
    port:Number(process.env.DB_PORT??5432),
    database:process.env.DB_NAME??'encev_pulse_dev',
    user:process.env.DB_USER??'encev_dev',
    password:process.env.POSTGRES_PASSWORD,
    connectionTimeoutMillis:3000,
    application_name:'encev-pulse-eced-integration',
  });
  const suffix=randomBytes(5).toString('hex');
  const names=['eo'+suffix,'et'+suffix,'ee'+suffix];
  const hasher=new PasswordHasher();
  const passwordHash=await hasher.hash(PASSWORD);
  const userIds:string[]=[];
  const deviceIds:string[]=[];
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
  async function publicApi(base:string,path:string,token:string,method='GET',body?:unknown){
    const response=await fetch(base+'/api/'+path,{
      method,
      headers:{
        'X-Pulse-Token':token,
        ...(body===undefined?{}:{'Content-Type':'application/json'}),
      },
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    });
    const data=response.status===204?null:await response.json();
    return {response,data};
  }
  async function signIn(base:string,username:string):Promise<Client>{
    const csrfResponse=await fetch(base+'/api/auth/csrf',{
      method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:'{}',
    });
    const challenge=await csrfResponse.json() as {csrfToken:string};
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
    const roles=await pool.query<{id:string;code:string}>(
      "SELECT id,code FROM roles WHERE code=ANY($1::text[])",[['process_owner','employee']],
    );
    const roleIds=new Map(roles.rows.map(row=>[row.code,row.id]));
    assert.equal(roleIds.size,2,'Process-owner and employee roles must exist after migrations.');
    const roleCodes=['process_owner','process_owner','employee'];
    for(let i=0;i<names.length;i++){
      const inserted=await pool.query<{id:string}>(
        'INSERT INTO users(username,email,display_name,password_hash) VALUES($1,$2,$3,$4) RETURNING id',
        [names[i],names[i]+'@encev.com.tr','e-ÇED test '+names[i],passwordHash],
      );
      userIds.push(inserted.rows[0].id);
      await pool.query(
        'INSERT INTO user_role_assignments(user_id,role_id,assigned_by) VALUES($1,$2,$1)',
        [userIds[i],roleIds.get(roleCodes[i])],
      );
    }
    app=await NestFactory.create(ApplicationModule,{logger:['error']});
    app.setGlobalPrefix('api');
    await app.listen(0,'127.0.0.1');
    const base='http://127.0.0.1:'+(app.getHttpServer().address() as AddressInfo).port;
    const [ownerA,ownerB,employee]=await Promise.all(names.map(name=>signIn(base,name)));

    const denied=await api(base,employee,'eced/monitor');
    assert.equal(denied.response.status,403);

    const createdA=await api(base,ownerA,'eced/pairings','POST',{deviceName:'Test Chrome'});
    assert.equal(createdA.response.status,201,JSON.stringify(createdA.data));
    const deviceA=createdA.data.device as {id:string;deviceName:string};
    const tokenA=createdA.data.pairingToken as string;
    assert.equal(deviceA.deviceName,'Test Chrome');
    assert.match(tokenA,/^[A-Za-z0-9_-]{40,100}$/);
    deviceIds.push(deviceA.id);
    const storedToken=await pool.query<{token_hash:string}>(
      'SELECT token_hash FROM eced_browser_devices WHERE id=$1',[deviceA.id],
    );
    assert.equal(storedToken.rows[0].token_hash,createHash('sha256').update(tokenA).digest('hex'));
    assert.notEqual(storedToken.rows[0].token_hash,tokenA);

    const health=await publicApi(base,'eced/extension/health',tokenA);
    assert.equal(health.response.status,200);
    assert.equal(health.data.paired,true);
    assert.equal(health.data.deviceName,'Test Chrome');
    const invalidHealth=await publicApi(base,'eced/extension/health','invalid-pairing-token');
    assert.equal(invalidHealth.response.status,403);

    const report=await publicApi(base,'eced/reports',tokenA,'POST',{
      clientId:'test-extension-client',
      browser:'Google Chrome',
      tabId:'101',
      tabTitle:'ÇED Başvuru Listesi',
      url:'https://eced-test.example.gov.tr/Application/List?accountPassword=do-not-store#private',
      activeUiTab:'Başvuru listesi',
      accountName:'Test Kurum Hesabı',
      accountSource:'manual',
      sessionState:'active',
      tabActive:true,
      password:'must-not-be-persisted',
      cookies:'must-not-be-persisted',
      formValues:{secret:'must-not-be-persisted'},
      pageHtml:'must-not-be-persisted',
    });
    assert.equal(report.response.status,202,JSON.stringify(report.data));
    const storedReport=await pool.query<{
      portal_origin:string;page_path:string;tab_title:string;account_name:string;session_state:string;tab_active:boolean;
    }>(
      'SELECT portal_origin,page_path,tab_title,account_name,session_state,tab_active FROM eced_browser_reports WHERE device_id=$1',
      [deviceA.id],
    );
    assert.equal(storedReport.rowCount,1);
    assert.equal(storedReport.rows[0].portal_origin,'https://eced-test.example.gov.tr');
    assert.equal(storedReport.rows[0].page_path,'/Application/List');
    assert.equal(storedReport.rows[0].tab_title,'ÇED Başvuru Listesi');
    assert.equal(storedReport.rows[0].account_name,'Test Kurum Hesabı');
    assert.equal(storedReport.rows[0].session_state,'active');
    assert.equal(storedReport.rows[0].tab_active,true);
    assert.doesNotMatch(storedReport.rows[0].page_path,/accountPassword|private/);

    const unknownReport=await publicApi(base,'eced/reports',tokenA,'POST',{
      clientId:'test-extension-client',browser:'Google Chrome',tabId:'102',
      url:'https://eced-test.example.gov.tr/Dashboard?ignored=yes',
      accountName:'',sessionState:'active',accountSource:'unknown',
    });
    assert.equal(unknownReport.response.status,202);
    const unknownRow=await pool.query<{session_state:string}>(
      "SELECT session_state FROM eced_browser_reports WHERE device_id=$1 AND tab_id='102'",[deviceA.id],
    );
    assert.equal(unknownRow.rows[0].session_state,'unknown','An active status without a visible account label must fail closed.');

    const monitor=await api(base,ownerA,'eced/monitor');
    assert.equal(monitor.response.status,200);
    assert.equal(monitor.data.reports.length,2);
    assert.equal(monitor.data.devices.length,1);

    const createdB=await api(base,ownerB,'eced/pairings','POST',{deviceName:'Test Edge'});
    assert.equal(createdB.response.status,201,JSON.stringify(createdB.data));
    const deviceB=createdB.data.device as {id:string};
    const tokenB=createdB.data.pairingToken as string;
    deviceIds.push(deviceB.id);

    const claimA=await api(base,ownerA,'eced/claims','POST',{accountName:'Test Kurum Hesabı',deviceId:deviceA.id});
    assert.equal(claimA.response.status,201,JSON.stringify(claimA.data));
    assert.equal(claimA.data.claimed,true);
    assert.equal(claimA.data.renewed,false);

    const competingClaim=await api(base,ownerB,'eced/claims','POST',{accountName:'Test Kurum Hesabı',deviceId:deviceB.id});
    assert.equal(competingClaim.response.status,409);

    const renewedClaim=await api(base,ownerA,'eced/claims','POST',{accountName:'Test Kurum Hesabı',deviceId:deviceA.id});
    assert.equal(renewedClaim.response.status,201);
    assert.equal(renewedClaim.data.renewed,true);

    const released=await api(base,ownerA,'eced/claims/'+encodeURIComponent('test kurum hesabı'),'DELETE',{});
    assert.equal(released.response.status,204);

    const claimAgain=await api(base,ownerA,'eced/claims','POST',{accountName:'Test Kurum Hesabı',deviceId:deviceA.id});
    assert.equal(claimAgain.response.status,201);
    const revoked=await api(base,ownerA,'eced/pairings/'+deviceA.id,'DELETE',{});
    assert.equal(revoked.response.status,204);
    const revokedHealth=await publicApi(base,'eced/extension/health',tokenA);
    assert.equal(revokedHealth.response.status,403);
    const revokedReport=await publicApi(base,'eced/reports',tokenA,'POST',{
      url:'https://eced-test.example.gov.tr/',
    });
    assert.equal(revokedReport.response.status,403);
    const remainingClaims=await pool.query('SELECT id FROM eced_account_claims WHERE device_id=$1',[deviceA.id]);
    assert.equal(remainingClaims.rowCount,0);
  } finally {
    if(app)await app.close();
    const cleanup=await pool.connect();
    try{
      await cleanup.query('BEGIN');
      if(deviceIds.length){
        await cleanup.query('ALTER TABLE eced_audit_events DISABLE TRIGGER eced_audit_events_append_only');
        await cleanup.query('DELETE FROM eced_audit_events WHERE device_id=ANY($1::uuid[])',[deviceIds]);
        await cleanup.query('ALTER TABLE eced_audit_events ENABLE TRIGGER eced_audit_events_append_only');
        await cleanup.query('DELETE FROM eced_account_claims WHERE device_id=ANY($1::uuid[])',[deviceIds]);
        await cleanup.query('DELETE FROM eced_browser_reports WHERE device_id=ANY($1::uuid[])',[deviceIds]);
        await cleanup.query('DELETE FROM eced_seen_accounts WHERE last_device_id=ANY($1::uuid[])',[deviceIds]);
        await cleanup.query('DELETE FROM eced_browser_devices WHERE id=ANY($1::uuid[])',[deviceIds]);
      }
      if(userIds.length){
        await cleanup.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[userIds]);
        await cleanup.query('DELETE FROM user_role_assignments WHERE user_id=ANY($1::uuid[])',[userIds]);
        await cleanup.query('ALTER TABLE auth_audit_events DISABLE TRIGGER auth_audit_events_append_only');
        await cleanup.query('DELETE FROM auth_audit_events WHERE actor_user_id=ANY($1::uuid[]) OR target_user_id=ANY($1::uuid[])',[userIds]);
        await cleanup.query('ALTER TABLE auth_audit_events ENABLE TRIGGER auth_audit_events_append_only');
        await cleanup.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[userIds]);
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
