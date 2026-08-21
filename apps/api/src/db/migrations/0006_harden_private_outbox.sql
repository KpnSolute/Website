alter table private.control_plane_outbox enable row level security;

create policy outbox_browser_deny on private.control_plane_outbox
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
