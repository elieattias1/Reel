-- Follow-up to 0003: create_set/update_set need to reach a client that
-- loaded a scene before any set existed for its location, same reasoning
-- as shots streaming in via Realtime.
alter publication supabase_realtime add table sets;
