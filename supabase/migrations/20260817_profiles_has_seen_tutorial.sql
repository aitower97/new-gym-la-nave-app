ALTER TABLE public.profiles
  ADD COLUMN has_seen_tutorial boolean NOT NULL DEFAULT false;
