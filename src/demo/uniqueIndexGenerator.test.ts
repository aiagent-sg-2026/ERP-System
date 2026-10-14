import { describe, expect, it } from 'vitest';
import { parseConflictTargets } from '../../scripts/generate-demo-unique-indexes.mjs';

describe('Demo unique-index generator conflict targets', () => {
  it.each(['t', 'public.t', '"public"."t"', '"t"', 'public."t"', '"public".t'])(
    'extracts the table from INSERT INTO %s', table => {
      expect(parseConflictTargets(`INSERT INTO ${table} (b, a) VALUES (1, 2) ON CONFLICT ("b", a) DO NOTHING;`))
        .toEqual([{ table: 't', columns: ['a', 'b'] }]);
    },
  );

  it('collects separate insert targets and deduplicates equivalent column lists', () => {
    expect(parseConflictTargets(`
      INSERT INTO public.t VALUES (1) ON CONFLICT (b, a) DO UPDATE SET b = excluded.b;
      INSERT INTO "t" VALUES (1) ON CONFLICT (a, b) DO NOTHING;
      INSERT INTO public.other VALUES (1) ON CONFLICT (id) DO NOTHING;
    `)).toEqual([{ table: 't', columns: ['a', 'b'] }, { table: 'other', columns: ['id'] }]);
  });

  it.each([
    'ON CONFLICT ON CONSTRAINT uq_t DO NOTHING',
    'ON CONFLICT (lower(code)) DO NOTHING',
    'ON CONFLICT ((code)) DO NOTHING',
    'ON CONFLICT (code text_pattern_ops) DO NOTHING',
    'ON CONFLICT (code) WHERE active DO NOTHING',
    'ON CONFLICT DO NOTHING',
    'ON CONFLICT () DO NOTHING',
  ])('rejects unsupported syntax: %s', conflict => {
    expect(() => parseConflictTargets(`INSERT INTO public.t VALUES (1) ${conflict};`))
      .toThrow('Unsupported ON CONFLICT syntax for t:');
  });

  it('ignores conflict prose in comments and string values', () => {
    expect(parseConflictTargets(`
      -- INSERT INTO wrong ON CONFLICT ON CONSTRAINT fake DO NOTHING
      INSERT INTO public.t VALUES ('ON CONFLICT ON CONSTRAINT fake', 'it''s ON CONFLICT')
      /* ON CONFLICT (wrong) */ ON CONFLICT (id) DO NOTHING;
      -- ON CONFLICT DO UPDATE
    `)).toEqual([{ table: 't', columns: ['id'] }]);
  });
});
