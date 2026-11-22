-- RLS does not protect against TRUNCATE, REFERENCES, or TRIGGER privileges.
-- Remove broad default grants and give signed-in users only the CRUD privileges
-- required by the client. Ownership remains enforced by the table RLS policies.
revoke all privileges on table public.notes, public.folders, public.labels, public.note_labels, public.attachments from anon, authenticated;
grant select, insert, update, delete on table public.notes, public.folders, public.labels, public.note_labels, public.attachments to authenticated;
