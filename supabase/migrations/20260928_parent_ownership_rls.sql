begin;

alter table public.photos add column if not exists ride_event_id uuid references public.ride_events(id) on delete set null;

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

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles', 'user_settings', 'motorcycles', 'trips', 'planned_stops',
    'gps_points', 'fuel_logs', 'expense_logs', 'ride_events', 'weather_snapshots',
    'photos', 'maintenance_logs', 'emergency_contacts', 'sync_queue', 'readiness_checks'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

drop policy if exists "users manage own profiles" on public.profiles;
create policy "users manage own profiles" on public.profiles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "users manage own settings" on public.user_settings;
create policy "users manage own settings" on public.user_settings for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "users manage own motorcycles" on public.motorcycles;
create policy "users manage own motorcycles" on public.motorcycles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "users manage own trips" on public.trips;
create policy "users manage own trips" on public.trips for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (motorcycle_id is null or exists (
      select 1 from public.motorcycles motorcycle
      where motorcycle.id = trips.motorcycle_id and motorcycle.user_id = trips.user_id
    ))
  );

drop policy if exists "users manage own planned stops" on public.planned_stops;
create policy "users manage own planned stops" on public.planned_stops for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.trips trip where trip.id = planned_stops.trip_id and trip.user_id = planned_stops.user_id)
  );

drop policy if exists "users manage own gps points" on public.gps_points;
create policy "users manage own gps points" on public.gps_points for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.trips trip where trip.id = gps_points.trip_id and trip.user_id = gps_points.user_id)
  );

drop policy if exists "users manage own fuel logs" on public.fuel_logs;
create policy "users manage own fuel logs" on public.fuel_logs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.motorcycles motorcycle where motorcycle.id = fuel_logs.motorcycle_id and motorcycle.user_id = fuel_logs.user_id)
    and (trip_id is null or exists (
      select 1 from public.trips trip
      where trip.id = fuel_logs.trip_id and trip.user_id = fuel_logs.user_id and trip.motorcycle_id = fuel_logs.motorcycle_id
    ))
  );

drop policy if exists "users manage own expenses" on public.expense_logs;
create policy "users manage own expenses" on public.expense_logs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (motorcycle_id is null or exists (
      select 1 from public.motorcycles motorcycle where motorcycle.id = expense_logs.motorcycle_id and motorcycle.user_id = expense_logs.user_id
    ))
    and (trip_id is null or exists (
      select 1 from public.trips trip
      where trip.id = expense_logs.trip_id and trip.user_id = expense_logs.user_id
        and (expense_logs.motorcycle_id is null or trip.motorcycle_id is null or trip.motorcycle_id = expense_logs.motorcycle_id)
    ))
  );

drop policy if exists "users manage own events" on public.ride_events;
create policy "users manage own events" on public.ride_events for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.trips trip where trip.id = ride_events.trip_id and trip.user_id = ride_events.user_id)
  );

drop policy if exists "users manage own weather" on public.weather_snapshots;
create policy "users manage own weather" on public.weather_snapshots for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.trips trip where trip.id = weather_snapshots.trip_id and trip.user_id = weather_snapshots.user_id)
  );

drop policy if exists "users manage own photos" on public.photos;
create policy "users manage own photos" on public.photos for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.trips trip where trip.id = photos.trip_id and trip.user_id = photos.user_id)
    and (ride_event_id is null or exists (
      select 1 from public.ride_events event
      where event.id = photos.ride_event_id and event.user_id = photos.user_id and event.trip_id = photos.trip_id
    ))
  );

drop policy if exists "users manage own maintenance" on public.maintenance_logs;
create policy "users manage own maintenance" on public.maintenance_logs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.motorcycles motorcycle
      where motorcycle.id = maintenance_logs.motorcycle_id and motorcycle.user_id = maintenance_logs.user_id
    )
  );

drop policy if exists "users manage own emergency contacts" on public.emergency_contacts;
create policy "users manage own emergency contacts" on public.emergency_contacts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "users manage own sync queue" on public.sync_queue;
create policy "users manage own sync queue" on public.sync_queue for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "riders manage own readiness checks" on public.readiness_checks;
create policy "riders manage own readiness checks" on public.readiness_checks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (motorcycle_id is null or exists (
      select 1 from public.motorcycles motorcycle
      where motorcycle.id = readiness_checks.motorcycle_id and motorcycle.user_id = readiness_checks.user_id
    ))
    and (trip_id is null or exists (
      select 1 from public.trips trip
      where trip.id = readiness_checks.trip_id and trip.user_id = readiness_checks.user_id
        and (readiness_checks.motorcycle_id is null or trip.motorcycle_id is null or trip.motorcycle_id = readiness_checks.motorcycle_id)
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
drop trigger if exists enforce_trip_motorcycle_consistency on public.trips;
create trigger enforce_trip_motorcycle_consistency
before update of motorcycle_id on public.trips
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
drop trigger if exists enforce_ride_event_trip_consistency on public.ride_events;
create trigger enforce_ride_event_trip_consistency
before update of trip_id on public.ride_events
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

create index if not exists planned_stops_trip_idx on public.planned_stops(trip_id);
create index if not exists ride_events_trip_time_idx on public.ride_events(trip_id, timestamp);
create index if not exists weather_snapshots_trip_time_idx on public.weather_snapshots(trip_id, timestamp);
create index if not exists photos_trip_time_idx on public.photos(trip_id, taken_at);
create index if not exists photos_ride_event_idx on public.photos(ride_event_id);
create index if not exists maintenance_logs_motorcycle_date_idx on public.maintenance_logs(motorcycle_id, date);
create index if not exists readiness_checks_trip_idx on public.readiness_checks(trip_id);
create index if not exists readiness_checks_motorcycle_idx on public.readiness_checks(motorcycle_id);

commit;
