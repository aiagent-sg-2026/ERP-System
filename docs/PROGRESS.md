# HR/Admin MVP progress

Reviewed: 2026-09-29. Scope and completion criteria are the active user goal.
This is the focused MVP work log; the root `PROGRESS.md` remains the wider ERP
project snapshot.

| Area | Current evidence | State / next action |
| --- | --- | --- |
| Shell and responsive UI | Focused Demo E2E in `docs/ai-native/evidence/TASK-251-2026-09-29-focused-demo-e2e.md` | Partial; inspect all scoped pages at desktop and mobile and complete visual review. |
| Company information | `src/modules/admin/companyProfile.ts`, API/Demo adapters and `tests/e2e/company-profile.spec.mjs`; persisted readback and desktop/375px screenshots in `docs/evidence/` | Implemented locally; production deployment/UAT remains separate. |
| Staff listing | Existing employee master and directory; focused create/search/detail/login E2E passed | Partial; verify edit, resignation, role and filters in browser and DB. |
| Leave application | Governed aggregate, balance ledger and approval routes exist; focused browser tests passed | Partial; verify overlap, per-type balance, calendar/list and status history against automated tests and real browser. |
| Receipts | Company Receipt register/Pack and My Receipts upload exist; focused browser E2E passed | Partial; verify category/year filters and clean yearly printable report, then cover upload validation and permissions. |

Current task: Staff listing lifecycle after the Company profile quality gates.
No production environment or production database is in scope.
