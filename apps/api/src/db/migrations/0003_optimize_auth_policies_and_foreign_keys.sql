-- Keep authenticated identity lookups as init plans and cover every foreign key
-- used by tenant, billing, installation, and audit joins.

drop policy if exists profiles_self_select on public.account_profiles;
create policy profiles_self_select on public.account_profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_self_update on public.account_profiles;
create policy profiles_self_update on public.account_profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists tenants_member_select on public.tenants;
create policy tenants_member_select on public.tenants
  for select to authenticated
  using (private.is_tenant_member(id) or created_by_user_id = (select auth.uid()));

drop policy if exists invitations_recipient_select on public.tenant_invitations;
create policy invitations_recipient_select on public.tenant_invitations
  for select to authenticated
  using (lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', '')));

drop policy if exists notifications_self_select on public.notifications;
create policy notifications_self_select on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create index if not exists audit_events_actor_user_id_idx
  on public.audit_events(actor_user_id);
create index if not exists custom_domains_installation_id_idx
  on public.custom_domains(installation_id);
create index if not exists custom_domains_tenant_id_idx
  on public.custom_domains(tenant_id);
create index if not exists invoices_subscription_id_idx
  on public.invoices(subscription_id);
create index if not exists product_installations_plan_id_idx
  on public.product_installations(plan_id);
create index if not exists product_installations_product_id_idx
  on public.product_installations(product_id);
create index if not exists role_permissions_permission_id_idx
  on public.role_permissions(permission_id);
create index if not exists subscriptions_installation_id_idx
  on public.subscriptions(installation_id);
create index if not exists subscriptions_plan_id_idx
  on public.subscriptions(plan_id);
create index if not exists tenant_invitations_invited_by_user_id_idx
  on public.tenant_invitations(invited_by_user_id);
create index if not exists tenant_invitations_role_id_idx
  on public.tenant_invitations(role_id);
create index if not exists tenant_invitations_tenant_id_idx
  on public.tenant_invitations(tenant_id);
create index if not exists tenant_memberships_role_id_idx
  on public.tenant_memberships(role_id);
create index if not exists tenants_created_by_user_id_idx
  on public.tenants(created_by_user_id);
create index if not exists usage_records_installation_id_idx
  on public.usage_records(installation_id);
