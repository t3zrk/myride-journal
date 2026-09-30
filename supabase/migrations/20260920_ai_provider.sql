alter table public.user_settings
  add column if not exists ai_provider text not null default 'local';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_settings_ai_provider_check') then
    alter table public.user_settings add constraint user_settings_ai_provider_check check (ai_provider in ('local', 'openai'));
  end if;
end $$;
