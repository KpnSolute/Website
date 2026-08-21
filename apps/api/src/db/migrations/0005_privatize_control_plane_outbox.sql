-- Internal delivery queues must not be reachable through the public Data API.
alter table public.control_plane_outbox disable row level security;
alter table public.control_plane_outbox set schema private;

revoke all on private.control_plane_outbox from public, anon, authenticated;
