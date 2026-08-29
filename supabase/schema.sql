-- Signal — lead intelligence console
-- Run this once in your Supabase project (SQL Editor).
-- All app access goes through server-side functions using the service_role key,
-- so RLS stays enabled with no public policies (deny-by-default for anon).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- clients
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  api_key text not null unique,
  intent_threshold integer not null default 60,
  parent_client_id uuid references public.clients (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists clients_parent_idx on public.clients (parent_client_id);

-- ------------------------------------------------------------- businesses
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  place_id text,
  name text not null,
  address text,
  website text,
  lat double precision,
  lng double precision,
  industry text,
  source text default 'google_places',
  has_website boolean,
  has_ssl boolean,
  payment_platform_detected text,
  signal_flags text[] not null default '{}',
  pitch_suggestion text,
  assessed_at timestamptz,
  status text not null default 'prospect' check (status in ('prospect', 'assessed', 'client')),
  converted_client_id uuid references public.clients (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists businesses_client_place_idx
  on public.businesses (client_id, place_id) where place_id is not null;
create index if not exists businesses_client_idx on public.businesses (client_id);

-- ----------------------------------------------------------- intent_events
create table if not exists public.intent_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  visitor_id text not null,
  event_type text not null,
  url text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists intent_events_client_visitor_idx
  on public.intent_events (client_id, visitor_id);

-- ------------------------------------------------------------------ leads
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete set null,
  visitor_id text,
  contact_name text,
  contact_email text,
  fit_score integer not null default 50,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists leads_client_email_idx
  on public.leads (client_id, contact_email);
create index if not exists leads_client_idx on public.leads (client_id);

-- ------------------------------------------------------------------- RLS
alter table public.clients enable row level security;
alter table public.businesses enable row level security;
alter table public.intent_events enable row level security;
alter table public.leads enable row level security;

-- No policies on purpose: anon/authenticated get no access. The app talks to
-- these tables only through server functions holding the service_role key,
-- which bypasses RLS. Grants are intentionally NOT given to anon.
grant all on public.clients to service_role;
grant all on public.businesses to service_role;
grant all on public.intent_events to service_role;
grant all on public.leads to service_role;

-- --------------------------------------------------------- agency bootstrap
-- Creates your own agency client row (parent_client_id = null) if none exists.
insert into public.clients (name, api_key, parent_client_id)
select 'My Agency', 'sk_agency_' || encode(gen_random_bytes(16), 'hex'), null
where not exists (select 1 from public.clients where parent_client_id is null);

-- Copy your agency key from here:
-- select name, api_key from public.clients where parent_client_id is null;
