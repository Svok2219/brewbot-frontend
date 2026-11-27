CREATE TABLE IF NOT EXISTS device_maintainers (
  device_id text PRIMARY KEY REFERENCES devices (device_id) ON DELETE CASCADE,
  email text NOT NULL,
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS device_maintainers_email_idx
  ON device_maintainers (lower(email));
