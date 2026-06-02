/** A single Telegram update pushed to our webhook. */
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
  chat: { id: number; type: string };
  date: number; // unix seconds
  text?: string;
  photo?: { file_id: string }[];
}
