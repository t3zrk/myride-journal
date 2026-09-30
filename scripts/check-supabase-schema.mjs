import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const root = fileURLToPath(new URL('..', import.meta.url))
const db = new PGlite()
const bootstrap = `
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null);
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
`

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  await db.exec(bootstrap)

  const schema = await readFile(join(root, 'supabase', 'schema.sql'), 'utf8')
  await db.exec(schema)
  await db.exec(schema)

  const migrationDirectory = join(root, 'supabase', 'migrations')
  const migrations = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql')).sort()
  const migrationSources = []
  for (const name of migrations) {
    const migration = await readFile(join(migrationDirectory, name), 'utf8')
    migrationSources.push(migration)
    await db.exec(migration)
    await db.exec(migration)
  }

  const expectedTables = [
    'profiles', 'user_settings', 'motorcycles', 'trips', 'planned_stops',
    'gps_points', 'fuel_logs', 'expense_logs', 'ride_events', 'weather_snapshots',
    'photos', 'maintenance_logs', 'emergency_contacts', 'sync_queue', 'readiness_checks',
  ]
  const rls = await db.query(`
    select relname
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public' and relname = any($1) and relrowsecurity
  `, [expectedTables])
  assert(rls.rows.length === expectedTables.length, `Expected RLS on ${expectedTables.length} tables, found ${rls.rows.length}.`)

  const policies = await db.query(`select policyname, roles, with_check from pg_policies where schemaname = 'public'`)
  assert(policies.rows.length === expectedTables.length, `Expected ${expectedTables.length} public policies, found ${policies.rows.length}.`)
  for (const policy of policies.rows) assert(policy.roles.includes('authenticated'), `${policy.policyname} is not scoped to authenticated users.`)

  const checks = new Map(policies.rows.map((policy) => [policy.policyname, policy.with_check ?? '']))
  const expectedParentChecks = new Map([
    ['users manage own trips', 'motorcycles'],
    ['users manage own planned stops', 'trips'],
    ['users manage own gps points', 'trips'],
    ['users manage own fuel logs', 'motorcycles'],
    ['users manage own expenses', 'trips'],
    ['users manage own events', 'trips'],
    ['users manage own weather', 'trips'],
    ['users manage own photos', 'ride_events'],
    ['users manage own maintenance', 'motorcycles'],
    ['riders manage own readiness checks', 'trips'],
  ])
  for (const [policy, parent] of expectedParentChecks) assert(checks.get(policy)?.includes(parent), `${policy} does not validate ${parent}.`)

  const privileges = await db.query(`
    select
      bool_and(not has_table_privilege('anon', format('public.%I', table_name), 'select')) as anon_denied,
      bool_and(has_table_privilege('authenticated', format('public.%I', table_name), 'select,insert,update,delete')) as rider_allowed
    from unnest($1::text[]) as table_name
  `, [expectedTables])
  assert(privileges.rows[0]?.anon_denied, 'Anonymous table access was not fully revoked.')
  assert(privileges.rows[0]?.rider_allowed, 'Authenticated riders are missing required table privileges.')

  const expectedDomainConstraints = [
    'profiles_values_check', 'user_settings_values_check', 'motorcycles_values_check', 'trips_values_check',
    'planned_stops_values_check', 'gps_points_values_check', 'fuel_logs_values_check',
    'expense_logs_values_check', 'ride_events_values_check', 'weather_snapshots_values_check',
    'photos_values_check', 'maintenance_logs_values_check', 'emergency_contacts_values_check',
    'sync_queue_values_check', 'readiness_checks_values_check',
  ]
  const domainConstraints = await db.query(`select conname from pg_constraint where conname = any($1)`, [expectedDomainConstraints])
  assert(domainConstraints.rows.length === expectedDomainConstraints.length, `Expected ${expectedDomainConstraints.length} domain constraints, found ${domainConstraints.rows.length}.`)

  const cardinalityIndexes = await db.query(`
    select indexname from pg_indexes
    where schemaname = 'public' and indexname in (
      'motorcycles_one_active_per_user_idx', 'trips_one_active_per_user_idx',
      'profiles_one_live_per_user_idx', 'user_settings_one_live_per_user_idx'
    )
  `)
  assert(cardinalityIndexes.rows.length === 4, 'Single-rider cardinality indexes are missing.')

  const userA = '11111111-1111-4111-8111-111111111111'
  const userB = '22222222-2222-4222-8222-222222222222'
  const bikeA = 'a0000000-0000-4000-8000-000000000001'
  const bikeA2 = 'a0000000-0000-4000-8000-000000000002'
  const bikeB = 'b0000000-0000-4000-8000-000000000001'
  const tripA = 'c0000000-0000-4000-8000-000000000001'
  const tripA2 = 'c0000000-0000-4000-8000-000000000002'
  const tripB = 'd0000000-0000-4000-8000-000000000001'
  const eventA = 'e0000000-0000-4000-8000-000000000002'
  const eventB = 'e0000000-0000-4000-8000-000000000001'
  await db.exec(`
    insert into auth.users (id) values ('${userA}'), ('${userB}');
    insert into public.motorcycles (id, user_id, manufacturer, model, current_odometer_km, active) values
      ('${bikeA}', '${userA}', 'Honda', 'CB350', 0, true),
      ('${bikeA2}', '${userA}', 'Honda', 'NX500', 0, false),
      ('${bikeB}', '${userB}', 'Yamaha', 'MT-03', 0, true);
    insert into public.trips (id, user_id, motorcycle_id, title, start_date, origin, destination, status) values
      ('${tripA}', '${userA}', '${bikeA}', 'A trip', now(), '{"label":"A"}', '{"label":"B"}', 'Planned'),
      ('${tripA2}', '${userA}', '${bikeA}', 'A second trip', now(), '{"label":"A"}', '{"label":"B"}', 'Planned'),
      ('${tripB}', '${userB}', '${bikeB}', 'B trip', now(), '{"label":"C"}', '{"label":"D"}', 'Planned');
    insert into public.ride_events (id, user_id, trip_id, type, title, timestamp) values
      ('${eventA}', '${userA}', '${tripA}', 'event', 'A event', now()),
      ('${eventB}', '${userB}', '${tripB}', 'event', 'B event', now());
    set role authenticated;
    set "request.jwt.claim.sub" = '${userA}';
  `)

  async function expectSqlRejection(sql, label) {
    let rejected = false
    try {
      await db.exec(sql)
    } catch {
      rejected = true
    }
    assert(rejected, `${label} was unexpectedly accepted.`)
  }

  await db.exec(`insert into public.planned_stops (id, user_id, trip_id, label) values (gen_random_uuid(), '${userA}', '${tripA}', 'Valid stop')`)
  await expectSqlRejection(`insert into public.planned_stops (id, user_id, trip_id, label) values (gen_random_uuid(), '${userA}', '${tripB}', 'Foreign stop')`, 'Cross-owner trip reference')
  await expectSqlRejection(`insert into public.trips (id, user_id, motorcycle_id, title, start_date, origin, destination, status) values (gen_random_uuid(), '${userA}', '${bikeB}', 'Foreign bike', now(), '{"label":"A"}', '{"label":"B"}', 'Planned')`, 'Cross-owner motorcycle reference')
  await expectSqlRejection(`insert into public.fuel_logs (id, user_id, motorcycle_id, trip_id, date_time, odometer_km, litres, full_tank) values (gen_random_uuid(), '${userA}', '${bikeA2}', '${tripA}', now(), 100, 5, true)`, 'Trip and fuel motorcycle mismatch')
  await expectSqlRejection(`insert into public.photos (id, user_id, trip_id, ride_event_id, taken_at) values (gen_random_uuid(), '${userA}', '${tripA}', '${eventB}', now())`, 'Trip and ride-event mismatch')
  await db.exec(`insert into public.photos (id, user_id, trip_id, ride_event_id, taken_at) values (gen_random_uuid(), '${userA}', '${tripA}', '${eventA}', now())`)
  await expectSqlRejection(`update public.ride_events set trip_id = '${tripA2}' where id = '${eventA}'`, 'Ride event move with linked photo')
  await db.exec(`insert into public.fuel_logs (id, user_id, motorcycle_id, trip_id, date_time, odometer_km, litres, full_tank) values (gen_random_uuid(), '${userA}', '${bikeA}', '${tripA}', now(), 100, 5, true)`)
  await expectSqlRejection(`update public.trips set motorcycle_id = '${bikeA2}' where id = '${tripA}'`, 'Trip motorcycle change with linked fuel')

  await expectSqlRejection(`insert into public.motorcycles (id, user_id, manufacturer, model, current_odometer_km, active) values (gen_random_uuid(), '${userA}', 'Honda', 'Duplicate active', 0, true)`, 'Second active motorcycle')
  await db.exec(`update public.trips set status = 'Active' where id = '${tripA}'`)
  await expectSqlRejection(`update public.trips set status = 'Active' where id = '${tripA2}'`, 'Second active trip')
  await expectSqlRejection(`insert into public.profiles (id, user_id, name) values (gen_random_uuid(), '${userA}', '   ')`, 'Blank profile name')
  await db.exec(`insert into public.profiles (id, user_id, name) values (gen_random_uuid(), '${userA}', 'Rider A')`)
  await expectSqlRejection(`insert into public.profiles (id, user_id, name) values (gen_random_uuid(), '${userA}', 'Duplicate rider')`, 'Second live profile')
  await db.exec(`insert into public.user_settings (id, user_id) values (gen_random_uuid(), '${userA}')`)
  await expectSqlRejection(`insert into public.user_settings (id, user_id) values (gen_random_uuid(), '${userA}')`, 'Second live settings record')
  await expectSqlRejection(`insert into public.planned_stops (id, user_id, trip_id, label, latitude) values (gen_random_uuid(), '${userA}', '${tripA}', 'Half coordinate', 10)`, 'Incomplete coordinate pair')
  await expectSqlRejection(`insert into public.gps_points (id, user_id, trip_id, latitude, longitude, timestamp) values (gen_random_uuid(), '${userA}', '${tripA}', 91, 10, now())`, 'Out-of-range GPS coordinate')
  await expectSqlRejection(`insert into public.fuel_logs (id, user_id, motorcycle_id, trip_id, date_time, odometer_km, litres, full_tank) values (gen_random_uuid(), '${userA}', '${bikeA}', '${tripA}', now(), 120, 0, true)`, 'Zero fuel quantity')
  await expectSqlRejection(`insert into public.expense_logs (id, user_id, trip_id, motorcycle_id, amount, currency, date, category, payment_method) values (gen_random_uuid(), '${userA}', '${tripA}', '${bikeA}', -1, 'INR', now(), 'food', 'Cash')`, 'Negative expense')
  await expectSqlRejection(`insert into public.trips (id, user_id, motorcycle_id, title, start_date, origin, destination, status) values (gen_random_uuid(), '${userA}', '${bikeA}', 'No end', now(), '{"label":"A"}', '{"label":"B"}', 'Completed')`, 'Completed trip without an end date')

  const visibleTrips = await db.query('select id from public.trips')
  assert(visibleTrips.rows.length === 2 && visibleTrips.rows.every((row) => row.id === tripA || row.id === tripA2), 'Authenticated rider can see another rider\'s trip.')
  const retainedTrip = await db.query(`select motorcycle_id from public.trips where id = '${tripA}'`)
  assert(retainedTrip.rows[0]?.motorcycle_id === bikeA, 'Rejected trip motorcycle update changed the stored trip.')
  const retainedEvent = await db.query(`select trip_id from public.ride_events where id = '${eventA}'`)
  assert(retainedEvent.rows[0]?.trip_id === tripA, 'Rejected ride event update changed the stored event.')
  await db.exec('reset role')

  const legacy = new PGlite()
  try {
    await legacy.exec(bootstrap)
    const expansionMarker = 'alter table motorcycles add column if not exists photo_data_url text;'
    const legacySchemaEnd = schema.indexOf(expansionMarker)
    assert(legacySchemaEnd > 0, 'Could not locate the legacy schema boundary.')
    await legacy.exec(schema.slice(0, legacySchemaEnd))
    for (const migration of migrationSources) await legacy.exec(migration)

    const requiredUpgradeColumns = [
      'profiles.bio', 'profiles.riding_style', 'profiles.photo_data_url', 'profiles.deleted_at',
      'motorcycles.photo_data_url', 'motorcycles.deleted_at',
      'photos.thumbnail_data_url', 'photos.location_source', 'photos.ride_event_id', 'photos.deleted_at',
      'weather_snapshots.humidity_percent', 'weather_snapshots.weather_code', 'weather_snapshots.deleted_at',
      'user_settings.temperature_unit', 'user_settings.date_format', 'user_settings.maintenance_reminders_enabled', 'user_settings.ai_provider',
      'readiness_checks.trip_id', 'readiness_checks.motorcycle_id', 'readiness_checks.deleted_at',
    ]
    const upgradedColumns = await legacy.query(`
      select table_name || '.' || column_name as name
      from information_schema.columns
      where table_schema = 'public'
    `)
    const upgraded = new Set(upgradedColumns.rows.map((row) => row.name))
    for (const column of requiredUpgradeColumns) assert(upgraded.has(column), `Legacy migration path is missing ${column}.`)
  } finally {
    await legacy.close()
  }

  console.log(`Supabase schema check passed: ${expectedTables.length} RLS tables, ${migrations.length} migrations, and the legacy upgrade path.`)
} finally {
  await db.close()
}
