import { config } from './config.js';
import { log } from './logger.js';

/** Fan out a message to Telegram and/or Discord if configured. Never throws. */
export async function notify(message: string): Promise<void> {
  await Promise.all([sendTelegram(message), sendDiscord(message)]);
}

async function sendTelegram(text: string): Promise<void> {
  if (!config.telegramBotToken || !config.telegramChatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.telegramChatId, text, disable_web_page_preview: true }),
    });
  } catch (err) {
    log.warn('Telegram notify failed', String(err));
  }
}

async function sendDiscord(content: string): Promise<void> {
  if (!config.discordWebhook) return;
  try {
    await fetch(config.discordWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    log.warn('Discord notify failed', String(err));
  }
}
