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

Executed once after targeted development:

- `npm test`: 7 passed, 0 failed, duration 1.084 s;
- `npm run build`: API TypeScript and Web Vite production build passed;
- API `tsc --noEmit`: passed;
- fresh API compile: 11 files, 0 SHA mismatches against generated `dist`;
- `git diff --check`: passed;
- five operational shell scripts: Git Bash syntax passed.

Immutable release:

- source commit `aed6daa8708006bae23353757c802ef470ba20a9`;
- `release-artifacts/urbanqueen-access-aed6daa.tar.gz`;
- SHA256 `257129904d8540db5565aeea798725cb86430369af211b4e9d48c3cf39dd43e1`.

## Pending external acceptance

The live GetCourse Cycle A/B is pending the owner-only test-process setup described
in `reports/getcourse-repeat-event-scheme.md`. Automated acceptance does not
pretend that this external step has happened.
