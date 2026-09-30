create table if not exists profiles (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  home_base text,
  blood_group text,
  allergies text,
  medical_notes text,
  ai_sensitive_access boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_settings (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  distance_unit text not null default 'km',
  fuel_unit text not null default 'litre',
  currency text not null default 'INR',
  gps_interval_seconds integer not null default 60,
  safe_range_reserve_percent integer not null default 15,
  ai_enabled boolean not null default false,
  ai_provider text not null default 'local' check (ai_provider in ('local', 'openai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists motorcycles (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  manufacturer text not null,
  model text not null,
  variant text,
  year integer,
  registration text,
  nickname text,
  engine_capacity_cc integer,
  tank_capacity_litres numeric,
  fuel_type text,
  current_odometer_km numeric not null default 0,
  service_interval_km numeric,
  tyre_information text,
  photo_path text,
  notes text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trips (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  motorcycle_id uuid references motorcycles(id) on delete set null,
  title text not null,
  start_date timestamptz not null,
  end_date timestamptz,
  origin jsonb not null,
  destination jsonb not null,
  status text not null check (status in ('Planned','Active','Completed','Cancelled')),
  notes text,
  distance_km numeric,
  duration_minutes numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists planned_stops (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, trip_id uuid references trips(id) on delete cascade, label text not null, latitude numeric, longitude numeric, planned_at timestamptz, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists gps_points (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, trip_id uuid references trips(id) on delete cascade, latitude numeric not null, longitude numeric not null, timestamp timestamptz not null, accuracy numeric, altitude numeric, speed numeric, heading numeric, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists fuel_logs (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, motorcycle_id uuid references motorcycles(id) on delete cascade, trip_id uuid references trips(id) on delete set null, date_time timestamptz not null, odometer_km numeric not null, litres numeric not null, price_per_litre numeric, total_cost numeric, station text, full_tank boolean not null, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists expense_logs (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, trip_id uuid references trips(id) on delete set null, motorcycle_id uuid references motorcycles(id) on delete set null, amount numeric not null, currency text not null, date timestamptz not null, category text not null, payment_method text not null, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists ride_events (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, trip_id uuid references trips(id) on delete cascade, type text not null, title text not null, notes text, timestamp timestamptz not null, latitude numeric, longitude numeric, location_name text, distance_from_start_km numeric, distance_from_previous_km numeric, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists weather_snapshots (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, trip_id uuid references trips(id) on delete cascade, timestamp timestamptz not null, latitude numeric not null, longitude numeric not null, temperature_c numeric, precipitation_mm numeric, wind_kph numeric, summary text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists photos (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, trip_id uuid references trips(id) on delete cascade, storage_path text, caption text, taken_at timestamptz not null, latitude numeric, longitude numeric, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists maintenance_logs (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, motorcycle_id uuid references motorcycles(id) on delete cascade, date timestamptz not null, odometer_km numeric not null, service_type text not null, component text not null, workshop text, cost numeric, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists emergency_contacts (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, name text not null, relationship text, phone text not null, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists sync_queue (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, entity text not null, entity_id uuid not null, operation text not null, payload jsonb not null, error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());

alter table profiles enable row level security;
alter table user_settings enable row level security;
alter table motorcycles enable row level security;
alter table trips enable row level security;
alter table planned_stops enable row level security;
alter table gps_points enable row level security;
alter table fuel_logs enable row level security;
alter table expense_logs enable row level security;
alter table ride_events enable row level security;
alter table weather_snapshots enable row level security;
alter table photos enable row level security;
alter table maintenance_logs enable row level security;
alter table emergency_contacts enable row level security;
alter table sync_queue enable row level security;

drop policy if exists "users manage own profiles" on profiles;
create policy "users manage own profiles" on profiles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "users manage own settings" on user_settings;
create policy "users manage own settings" on user_settings for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "users manage own motorcycles" on motorcycles;
create policy "users manage own motorcycles" on motorcycles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "users manage own trips" on trips;
create policy "users manage own trips" on trips for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (motorcycle_id is null or exists (
      select 1 from motorcycles motorcycle
      where motorcycle.id = trips.motorcycle_id and motorcycle.user_id = trips.user_id
    ))
  );
drop policy if exists "users manage own planned stops" on planned_stops;
create policy "users manage own planned stops" on planned_stops for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from trips trip where trip.id = planned_stops.trip_id and trip.user_id = planned_stops.user_id)
  );
drop policy if exists "users manage own gps points" on gps_points;
create policy "users manage own gps points" on gps_points for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from trips trip where trip.id = gps_points.trip_id and trip.user_id = gps_points.user_id)
  );
drop policy if exists "users manage own fuel logs" on fuel_logs;
create policy "users manage own fuel logs" on fuel_logs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from motorcycles motorcycle where motorcycle.id = fuel_logs.motorcycle_id and motorcycle.user_id = fuel_logs.user_id)
    and (trip_id is null or exists (
      select 1 from trips trip
      where trip.id = fuel_logs.trip_id and trip.user_id = fuel_logs.user_id and trip.motorcycle_id = fuel_logs.motorcycle_id
    ))
  );
drop policy if exists "users manage own expenses" on expense_logs;
create policy "users manage own expenses" on expense_logs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (motorcycle_id is null or exists (
      select 1 from motorcycles motorcycle where motorcycle.id = expense_logs.motorcycle_id and motorcycle.user_id = expense_logs.user_id
    ))
    and (trip_id is null or exists (
      select 1 from trips trip
      where trip.id = expense_logs.trip_id and trip.user_id = expense_logs.user_id
        and (expense_logs.motorcycle_id is null or trip.motorcycle_id is null or trip.motorcycle_id = expense_logs.motorcycle_id)
    ))
  );
drop policy if exists "users manage own events" on ride_events;
create policy "users manage own events" on ride_events for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from trips trip where trip.id = ride_events.trip_id and trip.user_id = ride_events.user_id)
  );
drop policy if exists "users manage own weather" on weather_snapshots;
create policy "users manage own weather" on weather_snapshots for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from trips trip where trip.id = weather_snapshots.trip_id and trip.user_id = weather_snapshots.user_id)
  );
drop policy if exists "users manage own photos" on photos;
create policy "users manage own photos" on photos for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from trips trip where trip.id = photos.trip_id and trip.user_id = photos.user_id)
  );
drop policy if exists "users manage own maintenance" on maintenance_logs;
create policy "users manage own maintenance" on maintenance_logs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from motorcycles motorcycle
      where motorcycle.id = maintenance_logs.motorcycle_id and motorcycle.user_id = maintenance_logs.user_id
    )
  );
drop policy if exists "users manage own emergency contacts" on emergency_contacts;
create policy "users manage own emergency contacts" on emergency_contacts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "users manage own sync queue" on sync_queue;
create policy "users manage own sync queue" on sync_queue for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index if not exists trips_user_status_idx on trips(user_id, status);
create index if not exists gps_points_trip_time_idx on gps_points(trip_id, timestamp);
create index if not exists fuel_logs_motorcycle_odometer_idx on fuel_logs(motorcycle_id, odometer_km);
create index if not exists expense_logs_trip_idx on expense_logs(trip_id);

alter table motorcycles add column if not exists photo_data_url text;
alter table profiles add column if not exists bio text;
alter table profiles add column if not exists riding_style text;
alter table profiles add column if not exists photo_data_url text;
alter table photos add column if not exists thumbnail_data_url text;
alter table photos add column if not exists location_source text;
alter table photos add column if not exists ride_event_id uuid references ride_events(id) on delete set null;
alter table weather_snapshots add column if not exists humidity_percent numeric;
alter table weather_snapshots add column if not exists weather_code integer;
alter table user_settings add column if not exists temperature_unit text not null default 'C';
alter table user_settings add column if not exists date_format text not null default 'local';
alter table user_settings add column if not exists maintenance_reminders_enabled boolean not null default false;
alter table user_settings add column if not exists ai_provider text not null default 'local';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_settings_ai_provider_check') then
    alter table public.user_settings add constraint user_settings_ai_provider_check check (ai_provider in ('local', 'openai'));
  end if;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles', 'user_settings', 'motorcycles', 'trips', 'planned_stops',
    'gps_points', 'fuel_logs', 'expense_logs', 'ride_events', 'weather_snapshots',
    'photos', 'maintenance_logs', 'emergency_contacts'
  ] loop
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', table_name);
    execute format('alter table public.%I alter column user_id set not null', table_name);
  end loop;
end $$;

insert into storage.buckets (id, name, public)
values ('trip-photos', 'trip-photos', false)
on conflict (id) do nothing;

drop policy if exists "riders upload own trip photos" on storage.objects;
create policy "riders upload own trip photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "riders read own trip photos" on storage.objects;
create policy "riders read own trip photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "riders update own trip photos" on storage.objects;
create policy "riders update own trip photos" on storage.objects
  for update to authenticated using (
    bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "riders delete own trip photos" on storage.objects;
create policy "riders delete own trip photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create table if not exists readiness_checks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid references trips(id) on delete cascade,
  motorcycle_id uuid references motorcycles(id) on delete set null,
  item text not null,
  checked boolean not null default false,
  checked_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table readiness_checks enable row level security;
drop policy if exists "riders manage own readiness checks" on readiness_checks;
create policy "riders manage own readiness checks" on readiness_checks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (motorcycle_id is null or exists (
      select 1 from motorcycles motorcycle
      where motorcycle.id = readiness_checks.motorcycle_id and motorcycle.user_id = readiness_checks.user_id
    ))
    and (trip_id is null or exists (
      select 1 from trips trip
      where trip.id = readiness_checks.trip_id and trip.user_id = readiness_checks.user_id
        and (readiness_checks.motorcycle_id is null or trip.motorcycle_id is null or trip.motorcycle_id = readiness_checks.motorcycle_id)
    ))
  );
create index if not exists readiness_checks_trip_idx on readiness_checks(trip_id);

drop policy if exists "users manage own photos" on photos;
create policy "users manage own photos" on photos for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from trips trip where trip.id = photos.trip_id and trip.user_id = photos.user_id)
    and (ride_event_id is null or exists (
      select 1 from ride_events event
      where event.id = photos.ride_event_id and event.user_id = photos.user_id and event.trip_id = photos.trip_id
    ))
  );

create schema if not exists myride_private;
create or replace function myride_private.enforce_trip_motorcycle_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.motorcycle_id is not distinct from old.motorcycle_id then return new; end if;
  if exists (
    select 1 from public.fuel_logs fuel
    where fuel.trip_id = new.id and fuel.deleted_at is null and fuel.motorcycle_id is distinct from new.motorcycle_id
  ) or exists (
    select 1 from public.expense_logs expense
    where expense.trip_id = new.id and expense.deleted_at is null and new.motorcycle_id is not null
      and expense.motorcycle_id is not null and expense.motorcycle_id is distinct from new.motorcycle_id
  ) or exists (
    select 1 from public.readiness_checks readiness
    where readiness.trip_id = new.id and readiness.deleted_at is null and new.motorcycle_id is not null
      and readiness.motorcycle_id is not null and readiness.motorcycle_id is distinct from new.motorcycle_id
  ) then
    raise exception 'Trip motorcycle cannot change while linked records belong to another motorcycle.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function myride_private.enforce_trip_motorcycle_consistency() from public;
drop trigger if exists enforce_trip_motorcycle_consistency on trips;
create trigger enforce_trip_motorcycle_consistency
before update of motorcycle_id on trips
for each row execute function myride_private.enforce_trip_motorcycle_consistency();

create or replace function myride_private.enforce_ride_event_trip_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.trip_id is not distinct from old.trip_id then return new; end if;
  if exists (
    select 1 from public.photos photo
    where photo.ride_event_id = new.id and photo.deleted_at is null and photo.trip_id is distinct from new.trip_id
  ) then
    raise exception 'Ride event trip cannot change while linked photos belong to another trip.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function myride_private.enforce_ride_event_trip_consistency() from public;
drop trigger if exists enforce_ride_event_trip_consistency on ride_events;
create trigger enforce_ride_event_trip_consistency
before update of trip_id on ride_events
for each row execute function myride_private.enforce_ride_event_trip_consistency();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles', 'user_settings', 'motorcycles', 'trips', 'planned_stops',
    'gps_points', 'fuel_logs', 'expense_logs', 'ride_events', 'weather_snapshots',
    'photos', 'maintenance_logs', 'emergency_contacts', 'sync_queue', 'readiness_checks'
  ] loop
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    execute format('create index if not exists %I on public.%I (user_id)', table_name || '_user_id_idx', table_name);
  end loop;
end $$;

create index if not exists planned_stops_trip_idx on planned_stops(trip_id);
create index if not exists ride_events_trip_time_idx on ride_events(trip_id, timestamp);
create index if not exists weather_snapshots_trip_time_idx on weather_snapshots(trip_id, timestamp);
create index if not exists photos_trip_time_idx on photos(trip_id, taken_at);
create index if not exists photos_ride_event_idx on photos(ride_event_id);
create index if not exists maintenance_logs_motorcycle_date_idx on maintenance_logs(motorcycle_id, date);
create index if not exists readiness_checks_motorcycle_idx on readiness_checks(motorcycle_id);

-- Normalize legacy duplicate active rows before enforcing single-rider cardinality.
with ranked as (
  select id, row_number() over (partition by user_id order by updated_at desc, id desc) as position
  from public.motorcycles
  where active and deleted_at is null
)
update public.motorcycles motorcycle
set active = false, updated_at = greatest(motorcycle.updated_at, now())
from ranked
where motorcycle.id = ranked.id and ranked.position > 1;

with ranked as (
  select id, row_number() over (partition by user_id order by updated_at desc, id desc) as position
  from public.trips
  where status = 'Active' and deleted_at is null
)
update public.trips trip
set status = 'Planned', updated_at = greatest(trip.updated_at, now())
from ranked
where trip.id = ranked.id and ranked.position > 1;

create unique index if not exists motorcycles_one_active_per_user_idx
  on public.motorcycles(user_id) where active and deleted_at is null;
create unique index if not exists trips_one_active_per_user_idx
  on public.trips(user_id) where status = 'Active' and deleted_at is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_values_check') then
    alter table public.profiles add constraint profiles_values_check check (length(btrim(name)) > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_settings_values_check') then
    alter table public.user_settings add constraint user_settings_values_check check (distance_unit in ('km', 'mi') and fuel_unit in ('litre', 'gallon') and temperature_unit in ('C', 'F') and date_format in ('local', 'iso') and currency ~ '^[A-Z]{3}$' and gps_interval_seconds in (30, 60, 120) and safe_range_reserve_percent between 0 and 50);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'motorcycles_values_check') then
    alter table public.motorcycles add constraint motorcycles_values_check check (length(btrim(manufacturer)) > 0 and length(btrim(model)) > 0 and current_odometer_km >= 0 and (year is null or year between 1885 and 2200) and (engine_capacity_cc is null or engine_capacity_cc > 0) and (tank_capacity_litres is null or tank_capacity_litres > 0) and (service_interval_km is null or service_interval_km > 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trips_values_check') then
    alter table public.trips add constraint trips_values_check check (length(btrim(title)) > 0 and jsonb_typeof(origin) = 'object' and nullif(btrim(origin ->> 'label'), '') is not null and jsonb_typeof(destination) = 'object' and nullif(btrim(destination ->> 'label'), '') is not null and (end_date is null or end_date >= start_date) and (status <> 'Completed' or end_date is not null) and (distance_km is null or distance_km >= 0) and (duration_minutes is null or duration_minutes >= 0) and ((origin ->> 'latitude' is null and origin ->> 'longitude' is null) or (origin ->> 'latitude' is not null and origin ->> 'longitude' is not null and (origin ->> 'latitude')::numeric between -90 and 90 and (origin ->> 'longitude')::numeric between -180 and 180)) and ((destination ->> 'latitude' is null and destination ->> 'longitude' is null) or (destination ->> 'latitude' is not null and destination ->> 'longitude' is not null and (destination ->> 'latitude')::numeric between -90 and 90 and (destination ->> 'longitude')::numeric between -180 and 180)));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'planned_stops_values_check') then
    alter table public.planned_stops add constraint planned_stops_values_check check (length(btrim(label)) > 0 and ((latitude is null and longitude is null) or (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180)));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gps_points_values_check') then
    alter table public.gps_points add constraint gps_points_values_check check (latitude between -90 and 90 and longitude between -180 and 180 and (accuracy is null or accuracy >= 0) and (speed is null or speed >= 0) and (heading is null or heading between 0 and 360));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fuel_logs_values_check') then
    alter table public.fuel_logs add constraint fuel_logs_values_check check (odometer_km >= 0 and litres > 0 and (price_per_litre is null or price_per_litre >= 0) and (total_cost is null or total_cost >= 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expense_logs_values_check') then
    alter table public.expense_logs add constraint expense_logs_values_check check (amount > 0 and currency ~ '^[A-Z]{3}$' and category in ('fuel', 'stay', 'food', 'tea', 'snacks', 'tolls', 'parking', 'maintenance', 'accessories', 'repairs', 'other') and payment_method in ('UPI', 'Cash', 'Card', 'Other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ride_events_values_check') then
    alter table public.ride_events add constraint ride_events_values_check check (type in ('checkpoint', 'stop', 'event') and length(btrim(title)) > 0 and ((latitude is null and longitude is null) or (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180)) and (distance_from_start_km is null or distance_from_start_km >= 0) and (distance_from_previous_km is null or distance_from_previous_km >= 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'weather_snapshots_values_check') then
    alter table public.weather_snapshots add constraint weather_snapshots_values_check check (latitude between -90 and 90 and longitude between -180 and 180 and (precipitation_mm is null or precipitation_mm >= 0) and (wind_kph is null or wind_kph >= 0) and (humidity_percent is null or humidity_percent between 0 and 100));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'photos_values_check') then
    alter table public.photos add constraint photos_values_check check (((latitude is null and longitude is null) or (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180)) and (location_source is null or location_source in ('exif', 'trip-gps', 'manual')) and (location_source is null or (latitude is not null and longitude is not null)));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'maintenance_logs_values_check') then
    alter table public.maintenance_logs add constraint maintenance_logs_values_check check (odometer_km >= 0 and length(btrim(service_type)) > 0 and length(btrim(component)) > 0 and (cost is null or cost >= 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'emergency_contacts_values_check') then
    alter table public.emergency_contacts add constraint emergency_contacts_values_check check (length(btrim(name)) > 0 and length(btrim(phone)) > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sync_queue_values_check') then
    alter table public.sync_queue add constraint sync_queue_values_check check (operation in ('upsert', 'delete'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'readiness_checks_values_check') then
    alter table public.readiness_checks add constraint readiness_checks_values_check check ((trip_id is not null or motorcycle_id is not null) and length(btrim(item)) > 0 and (not checked or checked_at is not null));
  end if;
end $$;

-- A rider has one current identity and one current settings document. Older
-- duplicates are retained as tombstones so existing devices can converge.
with ranked_profiles as (
  select id, row_number() over (partition by user_id order by updated_at desc, created_at desc, id desc) as position
  from public.profiles
  where deleted_at is null
)
update public.profiles
set deleted_at = now(), updated_at = now()
where id in (select id from ranked_profiles where position > 1);

with ranked_settings as (
  select id, row_number() over (partition by user_id order by updated_at desc, created_at desc, id desc) as position
  from public.user_settings
  where deleted_at is null
)
update public.user_settings
set deleted_at = now(), updated_at = now()
where id in (select id from ranked_settings where position > 1);

create unique index if not exists profiles_one_live_per_user_idx
  on public.profiles(user_id) where deleted_at is null;
create unique index if not exists user_settings_one_live_per_user_idx
  on public.user_settings(user_id) where deleted_at is null;
