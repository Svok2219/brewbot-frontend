ALTER TABLE public.device_maintainers
  ADD COLUMN name text NOT NULL DEFAULT 'Device Maintainer',
  ADD COLUMN contact text NOT NULL DEFAULT '';
