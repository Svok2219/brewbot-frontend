ALTER TABLE products
  ADD COLUMN IF NOT EXISTS device_id text;

UPDATE products
SET device_id = 'APD260209001'
WHERE device_id IS NULL;

INSERT INTO products (
  id,
  device_id,
  name,
  description,
  price_paisa,
  image_url,
  stock,
  is_active,
  sort_order,
  created_at,
  updated_at
)
SELECT
  source.id || '-' || replace(gen_random_uuid()::text, '-', ''),
  target.device_id,
  source.name,
  source.description,
  source.price_paisa,
  source.image_url,
  source.stock,
  source.is_active,
  source.sort_order,
  source.created_at,
  source.updated_at
FROM devices AS target
CROSS JOIN products AS source
WHERE source.device_id = 'APD260209001'
  AND target.device_id <> 'APD260209001'
  AND NOT EXISTS (
    SELECT 1
    FROM products AS existing
    WHERE existing.device_id = target.device_id
  );

ALTER TABLE products
  ALTER COLUMN device_id SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE products
    ADD CONSTRAINT products_device_id_fkey
    FOREIGN KEY (device_id) REFERENCES devices (device_id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS products_device_active_sort_idx
  ON products (device_id, is_active, sort_order);

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS device_id text;

UPDATE campaigns
SET device_id = 'APD260209001'
WHERE device_id IS NULL;

DROP INDEX IF EXISTS campaigns_one_active_idx;

INSERT INTO campaigns (
  id,
  device_id,
  headline,
  supporting_text,
  artwork_url,
  is_active,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  target.device_id,
  source.headline,
  source.supporting_text,
  source.artwork_url,
  true,
  source.created_at,
  source.updated_at
FROM devices AS target
JOIN campaigns AS source
  ON source.device_id = 'APD260209001'
 AND source.is_active = true
WHERE target.device_id <> 'APD260209001'
  AND NOT EXISTS (
    SELECT 1
    FROM campaigns AS existing
    WHERE existing.device_id = target.device_id
      AND existing.is_active = true
  );

ALTER TABLE campaigns
  ALTER COLUMN device_id SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE campaigns
    ADD CONSTRAINT campaigns_device_id_fkey
    FOREIGN KEY (device_id) REFERENCES devices (device_id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS campaigns_one_active_device_idx
  ON campaigns (device_id)
  WHERE is_active = true;
