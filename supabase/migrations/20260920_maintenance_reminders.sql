alter table public.user_settings
  add column if not exists maintenance_reminders_enabled boolean not null default false;
