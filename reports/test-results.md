# Test results

## Targeted development checks

- migration 005 clean install / repeated runner: pass;
- webhook validation and state idempotency: pass;
- two-cycle same-link flow: pass;
- manual block / explicit unblock: pass;
- Telegram allowlist rejection: pass;
- incident dedupe / recovery: pass;
- GetCourse audit scope / repair / backoff / no audit on join: pass;
- API TypeScript `tsc --noEmit`: pass;
- `git diff --check`: pass;
- shell scripts parsed by Git Bash: pass.

## Acceptance suite

The single full `npm test`, full build, fresh API compile and source/dist
comparison are recorded after the feature commit is finalized.

## Pending external acceptance

The live GetCourse Cycle A/B is pending the owner-only test-process setup described
in `reports/getcourse-repeat-event-scheme.md`. Automated acceptance does not
pretend that this external step has happened.
