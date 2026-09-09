# GetCourse repeat-event scheme

## Current factual state

Read-only inspection on 2026-09-09 found process `2572358`:

- object: User;
- launch type: periodic check;
- one delayed task already exists;
- entry rule contains one selected user and a **production** VEDANIE group;
- it is therefore outside the permitted test-only contour for this milestone.

No GetCourse value was edited or saved.

GetCourse's official process documentation states that one process can create only
one task per user. Therefore a completed linear periodic process is not repeat-safe
for leave/re-add.

## Test-only repeat-safe design

Create a separate process for group `4939538`. Keep one task alive and loop between
membership conditions instead of expecting GetCourse to create a second task:

```text
periodic entry: user is in group 4939538
→ POST grant callback
→ wait until user is NOT in group 4939538
→ POST revoke callback
→ wait until user IS in group 4939538
→ POST grant callback
→ loop back to wait until NOT in group
```

This yields a new callback on every observed state transition while retries of the
same callback remain safe because the API compares the stored current state.
The 30-minute Export API audit remains a fallback only.

## Exact owner steps in GetCourse

1. Create/copy a User process named `TEST | UrbanQueen Access | repeat-safe`.
2. Set launch to `Периодическая проверка`.
3. Entry rule: `В группе` → the test group whose numeric ID is `4939538`.
4. Do not select either production group.
5. First operation: `Вызвать URL`, POST
   `https://access.urban-queen.com/api/callbacks/getcourse/access-link`.
6. Headers:
   - `Content-Type: application/json`
   - `X-Access-Secret: <paste the existing secret directly from VPS>`
7. Grant body:

```json
{
  "user_id": "{object.id}",
  "email": "{object.email}",
  "name": "{object.first_name} {object.last_name}",
  "group_id": 4939538,
  "access_status": "active",
  "event": "test_repeat_loop_grant"
}
```

8. Add `Ожидание условия`: user is **not** in test group `4939538`.
9. Add a POST `Вызвать URL` to
   `https://access.urban-queen.com/api/webhooks/getcourse` with the same headers.
10. Revoke body:

```json
{
  "user_id": "{object.id}",
  "email": "{object.email}",
  "name": "{object.first_name} {object.last_name}",
  "group_id": 4939538,
  "access_status": "inactive",
  "event": "test_repeat_loop_revoke"
}
```

11. Add `Ожидание условия`: user is in test group `4939538`.
12. Add the grant callback again, then connect it back to the “not in group” wait.
13. Use GetCourse's preview/test for one test user. Confirm variables render to values;
    never paste the secret into a report or screenshot.
14. Only after reviewing that every node references `4939538`, approve/start this
    separate test process.

The final approve/start/save is an owner action. After it is confirmed, perform two
real remove/re-add cycles and collect aggregate evidence from Access.

## Sources

- [GetCourse process launch types](https://getcourse.ru/blog/275873)
- [GetCourse callback operation](https://getcourse.ru/blog/276215)
- [GetCourse group management](https://getcourse.ru/blog/276065)
- [GetCourse funnels/events overview](https://getcourse.ru/blog/1179201)
