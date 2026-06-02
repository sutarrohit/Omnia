import env from "../src/env.js";

const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: `${env.PUBLIC_URL}/webhooks/telegram`,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET
  })
});

console.log(await res.json());
