# TASK-258: atomic Demo upgrades and safe visible diagnostics

2026-10-02 candidate on base `2b5c8d58df7effdba33dd29de4790b866e6f610e`.
The owner's actual startup cause remains **unconfirmed**. No owner browser
storage, Air computer or production database was accessed or reset.

## Source-supported boundary

The reported blank Modules page and generic failure text are consequences of any
failed Demo initialization. Asset request `v=118` is a cache-buster, not evidence
of the stored migration marker. The prior source independently skipped the HR
organization migration when a synthetic canonical117 schema carried bare marker118.
A full current-source memory-PGlite startup nevertheless reached17modules without
the HR objects. That defect alone does not reproduce the owner startup error.
The historical CompanyProfile branch was not remotely available; its identity or
repair is not inferred from the synthetic fixture.

## Candidate contract

- Canonical schema prefixes are generated from the ordered Drizzle journal with
  tag/SQL hash and structural identity. Metadata includes complete column types
  (precision/length), collation/nullability/default/identity, constraints,
  non-startup indexes, identity sequence options, governed triggers/enabled state
  and their canonical function definitions. Sequence values and ERP rows are not
  part of the fingerprint. The28 separately validated startup arbiters retain
  their existing bounded missing-index repair contract.
- Only exact canonical117 metadata mis-marked118 can take the embedded bounded
  HR compatibility repair. Partial, future or mismatched metadata/recorded
  identity fails closed. Extra unrelated tables/functions remain preserved;
  changes to canonical objects are not silently accepted. HR index name collisions
  in preserved extensions are rejected. Both HR masters, employee organization
  fields, four eligible canonical unique indexes, FKs and scope checks must validate.
- Precheck, the existing ordered compatibility runner, numeric marker and final
  identity share one transaction. Failed/interrupted DDL never advances a marker
  or leaves a partial genuine117 upgrade. A new database's canonical schema,
  seed, transaction examples, marker and identity are likewise atomic. Existing
  unseeded/partial/future storage is rejected before seeding.
- Compiled canonical hashes reject mixed/stale schema/migration assets before
  their SQL executes. Drizzle migrations and generated SQL bundles are unchanged.
- Wizard/login/loading and retained signed-in failures show localized details,
  local Copy diagnostic and Reload to retry. Late watchdog failure keeps entered
  wizard/login values; a signed-in fallback receives a diagnostic-only locked
  shell. Stored authentication/setup flags are retained, not cleared or activated.
- Diagnostics strictly allowlist code, stage and source-owned statement labels,
  plus phase/mode/readiness/build ID. No record values, SQL, original Error/stack,
  storage listing, user/company identity or credentials are logged/copied. Copy
  does not upload anything. Clipboard failure retains selectable diagnostic text.

## Verification and review

Focused real memory-PGlite tests cover canonical117 upgrade, collided118 repair,
healthy118 adoption, repeated/retried repair, retained tenant/staff/revoked
authority/extensions, unknown/future/partial metadata, identity mismatch, monetary
typmods, governed trigger/function drift, sequence/index drift, HR index collision,
stale assets, interruption before the real ordered runner's marker and atomic
fresh-seed rollback. Diagnostic projection/API exclusion and retained failure-shell
unit tests use the actual classic source helpers.

Independent review reproduced material omissions in the first candidate
(monetary typmods, append-only trigger/function drift, non-atomic genuine117
upgrade and an HR FK/index metadata join), plus bootstrap and signed-in diagnostic
gaps. These were repaired with explicit regressions. An exact committed-head
decision and final check results are recorded separately; working-tree checks
alone are not release approval.

The new Chromium/WebKit E2E reconstructs exact117 metadata in a **disposable**
browser context, verifies stored Company/staff/revoked membership/sentinel,
repeated reload, unknown-lineage failure, five-language diagnostic copy/fallback,
desktop/375px layout, reload-to-retry, and immediate/watchdog-late signed-in
failure. It records page and console errors. Synthetic setup is not owner storage
or physical-device certification.

## Verified blockers and stopping boundary

- Local cloud Chromium IPC is denied (`EPERM`), including the approved escalation
  route. Downloaded WebKit lacks host libraries. No cloud security/network setting
  was changed. Browser regressions are written and syntax-checked, **not executed**
  here, and therefore remain gates.
- The authorized ERP remote branch creation returned GitHub403
  `Resource not accessible by integration`. No alternate identity/credential route
  was used. No remote branch, draft PR or exact-head CI is asserted to exist.
- The deliverable is an exact-base/head patch and Git bundle with test/review
  records, pending an authorized writable connection/environment. It must not be
  represented as ready to merge or deployed until browser and exact-head CI gates pass.

Production PostgreSQL journals, grants, credentials, routes and UAT remain separate
and untouched. There is no owner-error-fix or production-readiness claim.
