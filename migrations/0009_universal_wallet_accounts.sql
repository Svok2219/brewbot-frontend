CREATE TABLE public.wallet_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text NOT NULL CHECK (length(trim(user_name)) > 0),
  student_id text,
  card_id text NOT NULL UNIQUE,
  password_hash text,
  wallet_balance_paisa integer NOT NULL DEFAULT 0 CHECK (wallet_balance_paisa >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX wallet_accounts_student_id_idx
  ON public.wallet_accounts (lower(trim(student_id)))
  WHERE student_id IS NOT NULL;

CREATE TABLE public.wallet_account_devices (
  account_id uuid NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE CASCADE,
  device_id text NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, device_id)
);

CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.wallet_accounts(id),
  type text NOT NULL CHECK (type IN ('opening_balance', 'topup', 'purchase')),
  amount_paisa integer NOT NULL CHECK (amount_paisa <> 0),
  balance_after_paisa integer NOT NULL CHECK (balance_after_paisa >= 0),
  reference text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

WITH grouped_users AS (
  SELECT
    upper(regexp_replace(trim(card_id), '[[:space:]:-]+', '', 'g')) AS card_id,
    (array_agg(user_name ORDER BY created_at))[1] AS user_name,
    max(NULLIF(trim(student_id), '')) AS student_id,
    sum(wallet_balance_paisa)::integer AS wallet_balance_paisa,
    min(created_at) AS created_at,
    max(updated_at) AS updated_at
  FROM public.rfid_users
  GROUP BY upper(regexp_replace(trim(card_id), '[[:space:]:-]+', '', 'g'))
)
INSERT INTO public.wallet_accounts (
  user_name, student_id, card_id, wallet_balance_paisa, created_at, updated_at
)
SELECT user_name, student_id, card_id, wallet_balance_paisa, created_at, updated_at
FROM grouped_users;

INSERT INTO public.wallet_account_devices (account_id, device_id)
SELECT DISTINCT account.id, legacy.device_id
FROM public.rfid_users AS legacy
JOIN public.wallet_accounts AS account
  ON account.card_id = upper(regexp_replace(trim(legacy.card_id), '[[:space:]:-]+', '', 'g'))
ON CONFLICT DO NOTHING;

INSERT INTO public.wallet_transactions (account_id, type, amount_paisa, balance_after_paisa, reference, created_at)
SELECT id, 'opening_balance', wallet_balance_paisa, wallet_balance_paisa,
       'opening:' || id::text, created_at
FROM public.wallet_accounts
WHERE wallet_balance_paisa > 0;

ALTER TABLE public.payment_attempts
  ADD COLUMN payment_method text NOT NULL DEFAULT 'eps'
    CHECK (payment_method IN ('eps', 'wallet')),
  ADD COLUMN wallet_account_id uuid REFERENCES public.wallet_accounts(id),
  ADD COLUMN wallet_idempotency_key text;

CREATE UNIQUE INDEX payment_attempts_wallet_idempotency_idx
  ON public.payment_attempts (wallet_account_id, wallet_idempotency_key)
  WHERE wallet_idempotency_key IS NOT NULL;

ALTER TABLE public.rfid_wallet_topups
  ADD COLUMN wallet_account_id uuid REFERENCES public.wallet_accounts(id);

UPDATE public.rfid_wallet_topups AS topup
SET wallet_account_id = account.id
FROM public.rfid_users AS legacy
JOIN public.wallet_accounts AS account
  ON account.card_id = upper(regexp_replace(trim(legacy.card_id), '[[:space:]:-]+', '', 'g'))
WHERE topup.rfid_user_id = legacy.id;

ALTER TABLE public.rfid_wallet_topups
  ALTER COLUMN rfid_user_id DROP NOT NULL,
  ALTER COLUMN device_id DROP NOT NULL;
