CREATE TABLE IF NOT EXISTS connectcircle_chat_messages (
  id text PRIMARY KEY,
  from_username text NOT NULL,
  to_username text NOT NULL,
  message text NOT NULL,
  image_attachment jsonb,
  created_at timestamptz NOT NULL,
  edited_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connectcircle_chat_messages_users_idx
  ON connectcircle_chat_messages (from_username, to_username, created_at);

CREATE INDEX IF NOT EXISTS connectcircle_chat_messages_created_idx
  ON connectcircle_chat_messages (created_at);
