# Repeat-safe access tests

## Automated result

The isolated integration scenario uses one synthetic user, GetCourse group `4939538`,
the allow-listed test Telegram chat and a fake Telegram Bot API.

Cycle A:

`grant → permanent link → temporary invite → join request → member → revoke → ban`

Cycle B:

`re-grant → same permanent link → technical unban → fresh invite → join request → member → revoke → ban`

Evidence asserted by the test:

- one user/access row throughout;
- two `ACCESS_GRANTED` and two `ACCESS_REVOKED` transitions;
- retries of an unchanged state create no duplicate event or job;
- permanent token is unchanged between both cycles;
- two different temporary invites are created with a 600-second TTL;
- duplicate Telegram `update_id` is ignored;
- unknown/expired invite is declined;
- event messages/payloads contain neither the permanent token nor integration secret.

## Live acceptance

Backend repeat safety is proven. The real GetCourse-to-test-Telegram Cycle A/B is
not yet marked passed: the current GetCourse process is periodic and uses a
production group condition, while this milestone permits only test group
`4939538`. Owner-only GetCourse setup is documented in
`reports/getcourse-repeat-event-scheme.md`.
