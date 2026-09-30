begin;

alter table public.motorcycles add column if not exists photo_data_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists riding_style text;
alter table public.profiles add column if not exists photo_data_url text;
alter table public.photos add column if not exists thumbnail_data_url text;
alter table public.photos add column if not exists location_source text;
alter table public.photos add column if not exists ride_event_id uuid references public.ride_events(id) on delete set null;
alter table public.weather_snapshots add column if not exists humidity_percent numeric;
alter table public.weather_snapshots add column if not exists weather_code integer;
alter table public.user_settings add column if not exists temperature_unit text not null default 'C';
alter table public.user_settings add column if not exists date_format text not null default 'local';
alter table public.user_settings add column if not exists maintenance_reminders_enabled boolean not null default false;
alter table public.user_settings add column if not exists ai_provider text not null default 'local';

do $$
begin
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

create table if not exists public.readiness_checks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete cascade,
  motorcycle_id uuid references public.motorcycles(id) on delete set null,
  item text not null,
  checked boolean not null default false,
  checked_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists readiness_checks_trip_idx on public.readiness_checks(trip_id);

commit;
