-- Keep the live Realtime publication aligned with the account-scoped client subscriptions.
-- Notes, folders, and labels are refreshed from Supabase after an event; payloads are not
-- applied directly to local state.
alter publication supabase_realtime add table public.folders;
alter publication supabase_realtime add table public.labels;
