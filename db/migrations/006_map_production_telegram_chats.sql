-- Production chat mapping only. Telegram mutations remain controlled exclusively
-- by ALLOW_PRODUCTION_TELEGRAM_MUTATIONS / TELEGRAM_TEST_CHAT_IDS.
UPDATE chats
SET telegram_chat_id = -1001755248719,
    telegram_chat_title = 'Основной чат ВЕДАНИЕ',
    updated_at = CURRENT_TIMESTAMP
WHERE getcourse_group_id = 4825549
  AND environment = 'production'
  AND (
    telegram_chat_id IS NOT -1001755248719
    OR telegram_chat_title IS NOT 'Основной чат ВЕДАНИЕ'
  );

UPDATE chats
SET telegram_chat_id = -1003964804598,
    telegram_chat_title = 'Гормональный возраст',
    updated_at = CURRENT_TIMESTAMP
WHERE getcourse_group_id = 4900239
  AND environment = 'production'
  AND (
    telegram_chat_id IS NOT -1003964804598
    OR telegram_chat_title IS NOT 'Гормональный возраст'
  );
