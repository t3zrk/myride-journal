-- Keep profile and settings lookup deterministic if older clients created
-- duplicate live records before these indexes existed.
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
