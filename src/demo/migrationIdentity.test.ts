import { readFileSync } from 'node:fs';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { assertDemoSchemaAsset, ensureDemoMigrationIdentity, initializeDemoDatabase, preflightDemoBootstrap, upgradeDemoSchema } from './migrationIdentity';
import { DEMO_SCHEMA_LINEAGE } from './schemaLineage.generated';
import { demoStructuralHash, readDemoStructuralContract } from './schemaLineage';

const schema=readFileSync('web/public/db/erp-system-schema.sql','utf8');
const latestIdentity=DEMO_SCHEMA_LINEAGE.identities.at(-1)!;
const hrIdentity=DEMO_SCHEMA_LINEAGE.identities.find(identity=>identity.version===118)!;
const priorSchema=schema.slice(0,schema.indexOf('-- 0118_classy_ronan'));
async function fixture(version=118,current=false) {
  const db=new PGlite();
  await db.exec(current?schema:priorSchema);
  await db.exec('create table "_erp_demo_migration"(version integer primary key,applied_at timestamptz not null default now())');
  await db.query('insert into "_erp_demo_migration"(version) values($1)',[version]);
  await db.exec(`
    insert into master(master_fn,login_code,name) values('M-FIXTURE','FIXTURE','Fictional retained Group');
    insert into currency(code,name,symbol) values('SGD','Singapore Dollar','S$');
    insert into company(master_fn,company_fn,name,country,currency,tax_regime) values('M-FIXTURE','C-FIXTURE','Fictional retained Company','SG','SGD','GST');
    insert into app_user(master_fn,username,email,full_name,password_hash,language) values('M-FIXTURE','fictional','fictional@example.test','Fictional retained user','public fictional fixture hash','en');
    insert into role(master_fn,company_fn,name,is_superadmin) values('M-FIXTURE','C-FIXTURE','Fictional retained role',false);
    insert into user_company(user_id,company_fn,role_id) select app_user.user_id,'C-FIXTURE',role.role_id from app_user,role;
    insert into user_company_role(user_id,company_fn,role_id,revoked_at) select app_user.user_id,'C-FIXTURE',role.role_id,current_timestamp from app_user,role;
    insert into employee(master_fn,company_fn,employee_no,full_name,email,department,job_title,start_date,base_salary) values('M-FIXTURE','C-FIXTURE','FICT-1','Fictional retained employee','fictional-employee@example.test','Existing Department','Existing Job','2026-01-01',1000);
    create table retained_custom_note(id integer primary key,note text);
    insert into retained_custom_note values(1,'Fictional unrelated retained extension');
  `);
  return db;
}
async function preserved(db:PGlite) {
  const result:Record<string,unknown>={};
  for(const table of ['master','company','app_user','role','user_company_role','retained_custom_note'])result[table]=(await db.query('select * from '+table+' order by 1')).rows;
  result.employee=(await db.query('select id,master_fn,company_fn,employee_no,full_name,department,job_title from employee order by id')).rows;
  return result;
}
async function identityTable(db:PGlite) {return (await db.query<{n:number}>("select count(*)::int as n from pg_tables where schemaname='public' and tablename='_erp_demo_schema_identity'")).rows[0].n;}
async function structure(db:PGlite) {return demoStructuralHash(await readDemoStructuralContract(db,DEMO_SCHEMA_LINEAGE.ownedTables,DEMO_SCHEMA_LINEAGE.ownedFunctions));}

function orderedRunner() {
  const adapter=readFileSync('web/public/assets/erp-system-data-adapter.js','utf8');
  const start=adapter.indexOf('  async function ensureSchemaUpToDate(db){');
  const end=adapter.indexOf('\n  async function ensureWarehousePickFixture',start);
  const context=vm.createContext({DEMO_SCHEMA_VERSION:latestIdentity.version,console:{info:()=>{}},state:{runtime:{assertDemoSchemaAsset}},fetchSql:async()=>readFileSync('web/public/db/erp-system-migrations.sql','utf8'),execBootStatement:async(tx:Transaction,_label:string,sql:string)=>tx.exec(sql)});
  vm.runInContext(adapter.slice(start,end)+'\n globalThis.upgrade=ensureSchemaUpToDate;',context);
  return context.upgrade as (tx:Transaction)=>Promise<unknown>;
}

describe('identity-aware bounded retained Demo compatibility',()=>{
  it('recognizes exact117 mis-marked118, repairs only HR schema and preserves tenant data/revoked authority/extensions',async()=>{
    const db=await fixture();
    try{
      const before=await preserved(db);
      expect(await ensureDemoMigrationIdentity(db)).toEqual({repaired:true,version:118});
      expect(await preserved(db)).toEqual(before);
      const identity=(await db.query('select version,tag,sql_hash from "_erp_demo_schema_identity"')).rows;
      const latest=hrIdentity;
      expect(identity).toEqual([{version:118,tag:latest.tag,sql_hash:latest.sqlHash}]);
      expect(await structure(db)).toBe(latest.structuralHash);
      expect((await db.query('select organization_version,business_unit_id,position_id from employee')).rows).toEqual([{organization_version:0,business_unit_id:null,position_id:null}]);
      expect(await ensureDemoMigrationIdentity(db)).toEqual({repaired:false,version:118});
      await upgradeDemoSchema(db,orderedRunner());
      expect(await ensureDemoMigrationIdentity(db,true)).toEqual({repaired:false,version:latestIdentity.version});
      expect(await preserved(db)).toEqual(before);
    }finally{await db.close();}
  });
  it('lets a genuine117 use ordered compatibility through the latest migration and records identity only after complete validation',async()=>{
    const db=await fixture(117);
    try{
      const before=await preserved(db);
      expect(await ensureDemoMigrationIdentity(db)).toEqual({repaired:false,version:117});
      expect(await identityTable(db)).toBe(0);
      await upgradeDemoSchema(db,orderedRunner());
      expect(await preserved(db)).toEqual(before);
      expect(await identityTable(db)).toBe(1);
    }finally{await db.close();}
  });
  it('adopts the healthy untracked latest schema once without changing any tenant records',async()=>{
    const db=await fixture(latestIdentity.version,true);
    try{
      const before=await preserved(db);
      await ensureDemoMigrationIdentity(db);
      await ensureDemoMigrationIdentity(db);
      expect(await preserved(db)).toEqual(before);
      expect((await db.query('select count(*)::int as n from "_erp_demo_schema_identity"')).rows).toEqual([{n:1}]);
    }finally{await db.close();}
  });
  it.each(['future marker','unknown canonical column','partial HR schema'])('rejects %s before DDL/identity writes and preserves records',async scenario=>{
    const db=await fixture(scenario==='future marker'?latestIdentity.version+1:118);
    try{
      if(scenario==='unknown canonical column')await db.exec("alter table employee add column unknown_retained_value text default 'fictional private sentinel'");
      if(scenario==='partial HR schema')await db.exec('create table hr_business_unit(id integer primary key)');
      const before=await preserved(db),metadataBefore=await structure(db);
      await expect(ensureDemoMigrationIdentity(db)).rejects.toMatchObject({code:'demo_schema_lineage_unknown',demoBootStatement:'VALIDATE DEMO SCHEMA LINEAGE',message:'demo_schema_lineage_unknown'});
      expect(await preserved(db)).toEqual(before);
      expect(await structure(db)).toBe(metadataBefore);
      expect(await identityTable(db)).toBe(0);
    }finally{await db.close();}
  });
  it.each(['wrong tag/hash','identity claims118 over actual117'])('rejects %s without rewriting markers or identity records',async scenario=>{
    const db=await fixture();
    try{
      const latest=hrIdentity;
      await db.exec('create table "_erp_demo_schema_identity"(version integer primary key,tag text not null,sql_hash text not null,applied_at timestamptz not null default now())');
      await db.query('insert into "_erp_demo_schema_identity"(version,tag,sql_hash) values(118,$1,$2)',scenario==='wrong tag/hash'?['fictional private tag','fictional private hash']:[latest.tag,latest.sqlHash]);
      const before=await preserved(db),metadataBefore=await structure(db);
      const identityBefore=(await db.query('select * from "_erp_demo_schema_identity"')).rows;
      await expect(ensureDemoMigrationIdentity(db)).rejects.toMatchObject({code:'demo_schema_lineage_mismatch',demoBootStatement:'VALIDATE DEMO MIGRATION IDENTITY',message:'demo_schema_lineage_mismatch'});
      expect(await preserved(db)).toEqual(before);
      expect(await structure(db)).toBe(metadataBefore);
      expect((await db.query('select * from "_erp_demo_schema_identity"')).rows).toEqual(identityBefore);
      expect((await db.query('select max(version)::int as version from "_erp_demo_migration"')).rows).toEqual([{version:118}]);
    }finally{await db.close();}
  });
  it('rolls back an interruption after HR DDL and allows the same bounded repair to retry',async()=>{
    const db=await fixture();
    try{
      const before=await preserved(db),metadataBefore=await structure(db);
      const interrupted={transaction:async(callback:(tx:Transaction)=>Promise<unknown>)=>db.transaction(async tx=>callback(new Proxy(tx,{get(target,key){
        if(key==='exec')return async(sql:string)=>{const result=await target.exec(sql);if(sql===DEMO_SCHEMA_LINEAGE.hrRepair.sql)throw new Error('fictional interruption');return result;};
        const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
      }})))} as unknown as PGlite;
      await expect(ensureDemoMigrationIdentity(interrupted)).rejects.toMatchObject({code:'demo_schema_repair_failed',demoBootStatement:'REPAIR DEMO HR ORGANIZATION'});
      expect(await preserved(db)).toEqual(before);
      expect(await structure(db)).toBe(metadataBefore);
      expect(await identityTable(db)).toBe(0);
      await ensureDemoMigrationIdentity(db);
      expect(await preserved(db)).toEqual(before);
    }finally{await db.close();}
  });
  it('commits the actual genuine117 ordered runner, numeric marker and identity atomically across interruption',async()=>{
    const db=await fixture(117);
    try{
      const before=await preserved(db),metadataBefore=await structure(db);
      const upgrade=orderedRunner();
      await expect(upgradeDemoSchema(db,tx=>upgrade(new Proxy(tx,{get(target,key){
        if(key==='query')return async(sql:string,parameters?:unknown[])=>{if(sql.includes('insert into "_erp_demo_migration"'))throw new Error('fictional interruption before marker');return target.query(sql,parameters);};
        const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
      }})))).rejects.toThrow('fictional interruption before marker');
      expect(await structure(db)).toBe(metadataBefore);
      expect(await preserved(db)).toEqual(before);
      expect(await identityTable(db)).toBe(0);
      expect((await db.query('select max(version)::int as version from "_erp_demo_migration"')).rows).toEqual([{version:117}]);
      await upgradeDemoSchema(db,upgrade);
      expect(await preserved(db)).toEqual(before);
      expect((await db.query('select version,tag from "_erp_demo_schema_identity"')).rows).toEqual([{version:latestIdentity.version,tag:latestIdentity.tag}]);
    }finally{await db.close();}
  });
  it.each(['monetary precision','disabled append-only trigger','changed trigger function','identity sequence options','non-startup index','HR index name collision'])('rejects material %s drift without schema/data repair',async scenario=>{
    const db=await fixture();
    try{
      const mutations:Record<string,string>={
        'monetary precision':'alter table invoice alter column total_amount type numeric(18,8)',
        'disabled append-only trigger':'alter table leave_balance_entry disable trigger leave_balance_entry_append_only',
        'changed trigger function':'create or replace function prevent_leave_balance_entry_mutation() returns trigger language plpgsql as $$ begin return new; end; $$',
        'identity sequence options':'alter sequence employee_id_seq increment by 7',
        'non-startup index':'create index unknown_retained_index on employee(full_name)',
        'HR index name collision':'create unique index uq_hr_business_unit_code on retained_custom_note(id)',
      };
      await db.exec(mutations[scenario]);
      const before=await preserved(db),metadataBefore=await structure(db);
      await expect(ensureDemoMigrationIdentity(db)).rejects.toMatchObject({code:'demo_schema_lineage_unknown',demoBootStatement:'VALIDATE DEMO SCHEMA LINEAGE'});
      expect(await preserved(db)).toEqual(before);
      expect(await structure(db)).toBe(metadataBefore);
      expect(await identityTable(db)).toBe(0);
    }finally{await db.close();}
  });
  it('rejects stale/mixed schema assets before SQL and identifies only the source-owned asset',async()=>{
    await expect(assertDemoSchemaAsset('erp-system-schema.sql',schema)).resolves.toBeUndefined();
    await expect(assertDemoSchemaAsset('erp-system-migrations.sql',readFileSync('web/public/db/erp-system-migrations.sql','utf8'))).resolves.toBeUndefined();
    await expect(assertDemoSchemaAsset('erp-system-migrations.sql','fictional private stale bundle')).rejects.toMatchObject({code:'demo_schema_lineage_mismatch',demoBootStatement:'erp-system-migrations.sql',message:'demo_schema_lineage_mismatch'});
  });
  it('rejects future/partial unseeded storage before bootstrap writes and atomically rolls back failed fresh initialization',async()=>{
    const future=new PGlite();
    try{
      await future.exec(`create table "_erp_demo_migration"(version integer primary key);insert into "_erp_demo_migration" values(${latestIdentity.version+1});create table retained_custom_note(note text);insert into retained_custom_note values('fictional retained extension')`);
      const before=await readDemoStructuralContract(future);
      await expect(preflightDemoBootstrap(future)).rejects.toMatchObject({code:'demo_schema_lineage_unknown'});
      await expect(initializeDemoDatabase(future,tx=>tx.exec(schema))).rejects.toMatchObject({code:'demo_schema_lineage_unknown'});
      expect(await readDemoStructuralContract(future)).toEqual(before);
      expect((await future.query('select note from retained_custom_note')).rows).toEqual([{note:'fictional retained extension'}]);
    }finally{await future.close();}
    const blank=new PGlite();
    try{
      await expect(initializeDemoDatabase(blank,async tx=>{await tx.exec(schema);throw new Error('fictional seed interruption');})).rejects.toThrow('fictional seed interruption');
      expect((await blank.query("select tablename from pg_tables where schemaname='public'")).rows).toEqual([]);
      await initializeDemoDatabase(blank,async tx=>{await tx.exec(schema);await tx.exec('create table "_erp_demo_migration"(version integer primary key);insert into "_erp_demo_migration" values('+latestIdentity.version+')');});
      expect(await identityTable(blank)).toBe(1);
    }finally{await blank.close();}
  });
});
