-- Server-authoritative sync versions for notes, folders, and labels.
-- Normalize historical client-generated timestamps once before installing the trigger.
update public.notes set updated_at = pg_catalog.clock_timestamp();
update public.folders set updated_at = pg_catalog.clock_timestamp();
update public.labels set updated_at = pg_catalog.clock_timestamp();

create or replace function public.set_updated_at_server()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := greatest(pg_catalog.clock_timestamp(), old.updated_at + interval '1 microsecond');
  else
    new.updated_at := pg_catalog.clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists notes_set_updated_at_server on public.notes;
create trigger notes_set_updated_at_server
before insert or update on public.notes
for each row execute function public.set_updated_at_server();

drop trigger if exists folders_set_updated_at_server on public.folders;
create trigger folders_set_updated_at_server
before insert or update on public.folders
for each row execute function public.set_updated_at_server();

drop trigger if exists labels_set_updated_at_server on public.labels;
create trigger labels_set_updated_at_server
before insert or update on public.labels
for each row execute function public.set_updated_at_server();
