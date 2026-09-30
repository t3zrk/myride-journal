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
    alter table public.user_settings add constraint user_settings_values_check check (
      distance_unit in ('km', 'mi')
      and fuel_unit in ('litre', 'gallon')
      and temperature_unit in ('C', 'F')
      and date_format in ('local', 'iso')
      and currency ~ '^[A-Z]{3}$'
      and gps_interval_seconds in (30, 60, 120)
      and safe_range_reserve_percent between 0 and 50
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'motorcycles_values_check') then
    alter table public.motorcycles add constraint motorcycles_values_check check (
      length(btrim(manufacturer)) > 0
      and length(btrim(model)) > 0
      and current_odometer_km >= 0
      and (year is null or year between 1885 and 2200)
      and (engine_capacity_cc is null or engine_capacity_cc > 0)
      and (tank_capacity_litres is null or tank_capacity_litres > 0)
      and (service_interval_km is null or service_interval_km > 0)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trips_values_check') then
    alter table public.trips add constraint trips_values_check check (
      length(btrim(title)) > 0
      and jsonb_typeof(origin) = 'object'
      and nullif(btrim(origin ->> 'label'), '') is not null
      and jsonb_typeof(destination) = 'object'
      and nullif(btrim(destination ->> 'label'), '') is not null
      and (end_date is null or end_date >= start_date)
      and (status <> 'Completed' or end_date is not null)
      and (distance_km is null or distance_km >= 0)
      and (duration_minutes is null or duration_minutes >= 0)
      and (
        (origin ->> 'latitude' is null and origin ->> 'longitude' is null)
        or (origin ->> 'latitude' is not null and origin ->> 'longitude' is not null and (origin ->> 'latitude')::numeric between -90 and 90 and (origin ->> 'longitude')::numeric between -180 and 180)
      )
      and (
        (destination ->> 'latitude' is null and destination ->> 'longitude' is null)
        or (destination ->> 'latitude' is not null and destination ->> 'longitude' is not null and (destination ->> 'latitude')::numeric between -90 and 90 and (destination ->> 'longitude')::numeric between -180 and 180)
      )
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'planned_stops_values_check') then
    alter table public.planned_stops add constraint planned_stops_values_check check (
      length(btrim(label)) > 0
      and ((latitude is null and longitude is null) or (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180))
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gps_points_values_check') then
    alter table public.gps_points add constraint gps_points_values_check check (
      latitude between -90 and 90
      and longitude between -180 and 180
      and (accuracy is null or accuracy >= 0)
      and (speed is null or speed >= 0)
      and (heading is null or heading between 0 and 360)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fuel_logs_values_check') then
    alter table public.fuel_logs add constraint fuel_logs_values_check check (
      odometer_km >= 0
      and litres > 0
      and (price_per_litre is null or price_per_litre >= 0)
      and (total_cost is null or total_cost >= 0)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expense_logs_values_check') then
    alter table public.expense_logs add constraint expense_logs_values_check check (
      amount > 0
      and currency ~ '^[A-Z]{3}$'
      and category in ('fuel', 'stay', 'food', 'tea', 'snacks', 'tolls', 'parking', 'maintenance', 'accessories', 'repairs', 'other')
      and payment_method in ('UPI', 'Cash', 'Card', 'Other')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ride_events_values_check') then
    alter table public.ride_events add constraint ride_events_values_check check (
      type in ('checkpoint', 'stop', 'event')
      and length(btrim(title)) > 0
      and ((latitude is null and longitude is null) or (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180))
      and (distance_from_start_km is null or distance_from_start_km >= 0)
      and (distance_from_previous_km is null or distance_from_previous_km >= 0)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'weather_snapshots_values_check') then
    alter table public.weather_snapshots add constraint weather_snapshots_values_check check (
      latitude between -90 and 90
      and longitude between -180 and 180
      and (precipitation_mm is null or precipitation_mm >= 0)
      and (wind_kph is null or wind_kph >= 0)
      and (humidity_percent is null or humidity_percent between 0 and 100)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'photos_values_check') then
    alter table public.photos add constraint photos_values_check check (
      ((latitude is null and longitude is null) or (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180))
      and (location_source is null or location_source in ('exif', 'trip-gps', 'manual'))
      and (location_source is null or (latitude is not null and longitude is not null))
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'maintenance_logs_values_check') then
    alter table public.maintenance_logs add constraint maintenance_logs_values_check check (
      odometer_km >= 0
      and length(btrim(service_type)) > 0
      and length(btrim(component)) > 0
      and (cost is null or cost >= 0)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'emergency_contacts_values_check') then
    alter table public.emergency_contacts add constraint emergency_contacts_values_check check (
      length(btrim(name)) > 0 and length(btrim(phone)) > 0
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sync_queue_values_check') then
    alter table public.sync_queue add constraint sync_queue_values_check check (operation in ('upsert', 'delete'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'readiness_checks_values_check') then
    alter table public.readiness_checks add constraint readiness_checks_values_check check (
      (trip_id is not null or motorcycle_id is not null)
      and length(btrim(item)) > 0
      and (not checked or checked_at is not null)
    );
  end if;
end $$;
