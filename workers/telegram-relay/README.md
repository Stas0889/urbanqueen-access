# UrbanQueen Telegram relay

Cloudflare Worker transports Telegram Bot API calls and `chat_join_request` webhooks without proxying the UrbanQueen website or admin panel.

Required encrypted Worker secrets:

- `TELEGRAM_BOT_TOKEN`
- `RELAY_SHARED_SECRET`
- `TELEGRAM_WEBHOOK_SECRET`
- `ORIGIN_WEBHOOK_SECRET`

The only non-secret variables are the REG.RU webhook URL and the allowlist containing the dedicated test chat ID. The Worker ignores webhook updates from every other chat.

Deploy from this directory with Wrangler, add all four secrets with `wrangler secret put`, then register `https://<worker-host>/webhook` through the relay's authenticated `setWebhook` endpoint. Use `allowed_updates: ["chat_join_request"]`.
