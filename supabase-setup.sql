-- ============================================================
-- MoviliChota PR — Supabase Setup
-- Run this in the Supabase SQL Editor (supabase.com/dashboard)
-- ============================================================

-- 1. Create the reports table
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  infraction_type text not null,
  image_url text,
  description text,
  created_at timestamptz not null default now()
);

-- 2. Enable Row Level Security
alter table public.reports enable row level security;

-- 3. Anyone can read reports
create policy "Anyone can read reports"
  on public.reports for select
  using (true);

-- 4. Anyone can insert reports (anonymous)
create policy "Anyone can insert reports"
  on public.reports for insert
  with check (true);

-- 5. No one can update or delete (immutable reports)
-- (No policies = denied by default with RLS enabled)

-- 6. Create the storage bucket for images
-- NOTE: Run this via the Supabase Dashboard > Storage > New Bucket
-- Bucket name: report-images
-- Public bucket: YES
--
-- Or via SQL (requires service role):
-- insert into storage.buckets (id, name, public) values ('report-images', 'report-images', true);

-- 7. Storage policies (allow anonymous uploads, public reads)
-- Go to Storage > report-images > Policies and add:
--
-- SELECT (read): Allow public access
--   Target roles: anon, authenticated
--   Policy: true
--
-- INSERT (upload): Allow anonymous uploads
--   Target roles: anon, authenticated
--   Policy: true

-- 8. Enable Realtime for the reports table
-- Go to Database > Replication and enable the `reports` table
-- Or run:
alter publication supabase_realtime add table public.reports;

-- Done! Now update SUPABASE_URL and SUPABASE_ANON_KEY in app.js
