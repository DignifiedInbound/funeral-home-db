-- Funeral Home Database Schema

create table if not exists funeral_homes (
  id                uuid primary key default gen_random_uuid(),

  -- Identity
  name              text not null,
  slug              text,
  domain            text,

  -- Location
  city              text,
  state             text,
  state_abbr        char(2),
  zip               text,
  address           text,
  lat               float,
  lng               float,

  -- Volume signals
  obits_count       int,
  google_reviews    int,
  google_rating     float,
  employee_count    int,

  -- Software detection
  uses_parting_pro  boolean default false,
  uses_efuneral     boolean default false,
  uses_tukios       boolean default false,
  software_detected text,

  -- Contact
  phone             text,
  email             text,
  owner_name        text,
  website           text,

  -- Source tracking
  source            text,
  sources           text[],
  echovita_url      text,
  legacy_url        text,
  maps_place_id     text,

  -- CRM
  lead_status       text default 'prospect',
  priority_score    int default 0,
  notes             text,

  -- Timestamps
  last_enriched_at  timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- Indexes for common queries
create index if not exists idx_fh_state        on funeral_homes(state_abbr);
create index if not exists idx_fh_source       on funeral_homes(source);
create index if not exists idx_fh_status       on funeral_homes(lead_status);
create index if not exists idx_fh_obits        on funeral_homes(obits_count desc);
create index if not exists idx_fh_software     on funeral_homes(software_detected);
create index if not exists idx_fh_parting_pro  on funeral_homes(uses_parting_pro);
create index if not exists idx_fh_name         on funeral_homes using gin(to_tsvector('english', name));

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger funeral_homes_updated_at
  before update on funeral_homes
  for each row execute function update_updated_at();

-- Computed priority score view
create or replace view funeral_homes_scored as
select *,
  coalesce(obits_count, 0) * 2
  + coalesce(google_reviews, 0)
  + case when uses_efuneral then 100 else 0 end
  + case when uses_tukios   then 100 else 0 end
  - case when uses_parting_pro then 500 else 0 end
  as computed_score
from funeral_homes;
