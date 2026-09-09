-- Preserve an existing current test rule. If an upgraded database still has only
-- the obsolete seed, move that same row to the approved test group. If both rows
-- exist, retain the obsolete row only as disabled history.
UPDATE chats
SET is_enabled = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE getcourse_group_id = 4938193
  AND EXISTS (SELECT 1 FROM chats WHERE getcourse_group_id = 4939538);

UPDATE chats
SET name = 'TEST | UrbanQueen Access',
    slug = 'test-urbanqueen-access',
    getcourse_group_id = 4939538,
    telegram_chat_id = -1003872347411,
    telegram_chat_title = 'TEST | UrbanQueen Access',
    is_enabled = 1,
    environment = 'test',
    updated_at = CURRENT_TIMESTAMP
WHERE getcourse_group_id = 4938193
  AND NOT EXISTS (SELECT 1 FROM chats WHERE getcourse_group_id = 4939538);
