CREATE TABLE IF NOT EXISTS connectcircle_users (
  id text PRIMARY KEY,
  username text NOT NULL,
  username_key text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE,
  display_name text,
  bio text,
  avatar_image text,
  avatar_url text,
  profile_visibility text,
  availability_status text,
  theme_preference text,
  password_hash text,
  password_salt text,
  password_algorithm text,
  google_sub text,
  auth_providers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS connectcircle_users_google_sub_unique
  ON connectcircle_users (google_sub)
  WHERE google_sub IS NOT NULL;

CREATE TABLE IF NOT EXISTS connectcircle_user_login_attempts (
  email_key text PRIMARY KEY,
  failed_attempts integer NOT NULL,
  first_failed_at timestamptz NOT NULL,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
