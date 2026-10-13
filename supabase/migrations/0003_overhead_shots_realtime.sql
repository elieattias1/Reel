-- Follow-up to 0002_overhead_shots.sql, kept separate since 0002 may
-- already be applied in some environments by the time this was added.

-- The blocking agent's own chat transcript needs to be distinguishable
-- from the Reel chat agent's, since both now write to chat_messages
-- (chat_sessions already distinguishes this via `kind`, added in 0002).
alter table chat_messages add column kind text not null default 'chat' check (kind in ('chat', 'blocking'));

-- add_shot pushes each new shot to the client over Supabase Realtime
-- (brief: "Shots stream to the UI one at a time as the agent creates
-- them") — requires the table to be in the realtime publication.
alter publication supabase_realtime add table shots;
