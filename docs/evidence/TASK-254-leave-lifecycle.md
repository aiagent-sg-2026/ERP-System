# TASK-254 Leave lifecycle local verification

Date: 2026-09-29. Target: local built Demo/PGlite and local API test server.
The browser used the fictional seeded employee and HR operator. No production
employee, leave balance or database was changed.

## Finding and correction

Two same-day governed leave drafts could both be submitted as Pending. The
submit command reserved available days but did not check an employee's other
pending or approved dates. `src/modules/hr/leaveApplication.test.ts` reproduced
the defect before the fix.

The shared command now locks the employee, rejects overlapping pending/approved
dates with `leave_dates_overlap` (409), and permits an AM plus PM half day on
one date. Final approval checks approved overlaps again, including legacy
records. Rejected attempts retain the original Draft or Pending state and do
not create a second reservation or decision.

## Real browser result

`tests/e2e/leave-overlap-mvp.spec.mjs` used the real Demo adapter and PGlite.
The employee created and submitted the first one-day request, then created a
second request for the same date. Submission displayed the overlap error and
the second row remained Draft. The HR operator approved the first request;
PGlite showed Approved and one paid-leave `use` entry. Switching back to the
employee showed the Approved event in the application's history. Desktop and
375 px browser views had zero console/page errors; the mobile dialog remained
inside the viewport and the page had no root horizontal overflow.

[Desktop overlap error](TASK-254-leave-overlap-desktop.png) ·
[375 px dialog](TASK-254-leave-overlap-mobile.png).

## Verification boundary

Source-verified regression coverage:

- `src/modules/hr/leaveApplication.test.ts`: submission overlap, opposite AM/PM
  half days and final-approval overlap with a legacy approved absence.
- `src/api/leaveApplication.integration.test.ts`: governed submission,
  optimistic versions, withdrawal, void and HR approval.
- `src/modules/hr/teamCalendar.test.ts`: Team Calendar overlapping-leave
  conflict flags, scoped visibility and privacy.
- `src/api/hrCalendar.integration.test.ts`: HR Calendar company-scoped holiday
  facts, range limits and governed holiday approval (not leave-overlap rejection).
- `tests/e2e/leave-overlap-mvp.spec.mjs`: real Demo/PGlite duplicate submission
  rejection and HR approval, described above.

The exact historical five-file domain/API/calendar run behind the reported
18 passing tests was not found in the available evidence; the browser file above
is separate, not a substitute for an unidentified fifth regression file.
The historical lint, root/web typechecks, PGlite Demo proof and built Demo
were reported as passing after the repair. See the closure evidence below for
what was observed on 2026-10-14.

These checks cover local source and Demo behavior. Production workflow UAT,
hosted release, PostgreSQL concurrency and external calendar delivery are
separate verification gates.

## Closure evidence (observed 2026-10-14)

- An omp read-only acceptance audit (spot-checked by the manager) confirmed the
  documentation items (`docs/PROJECT_LOGIC.md`, `docs/STATUS.md`, `docs/PROGRESS.md`) were
  already met and that the five regression files above exist; PR 27 (main `0c2e726`) now names
  them in this document.
- Exact-head CI: main `0c2e726` passed CI (2026-10-14 22:44-23:03 UTC, all Vitest shards);
  Pages deploy 38649686171 succeeded.
- Not verified: the exact historical five-file 18-test run; the leave-overlap browser spec was
  not re-run for this closure; production workflow UAT and external calendar delivery.
