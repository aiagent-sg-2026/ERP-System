import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const schema=readFileSync('web/public/db/erp-system-schema.sql','utf8');
const picks=readFileSync('web/public/db/erp-system-demo-picks.sql','utf8');

describe('optional Demo warehouse pick top-up',()=>{
  it('skips instead of blocking startup when a retained database lacks the canonical sample rows',async()=>{
    const db=new PGlite();
    try{
      await db.exec(schema);
      await db.exec("insert into master(master_fn,login_code,name) values('M1','RETAINED','Fictional retained Group')");
      await expect(db.exec(picks)).resolves.toBeDefined();
      expect((await db.query<{n:number}>('select count(*)::int as n from warehouse_pick')).rows[0].n).toBe(0);
    }finally{await db.close();}
  });
});
