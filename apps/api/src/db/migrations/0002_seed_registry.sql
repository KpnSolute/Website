-- Seed the fixed product and permission registry.
-- Service keys and hosts here must match packages/contracts/src/registry.ts.

insert into permissions (key, description) values
  ('tenant.manage', 'Manage tenant settings and lifecycle'),
  ('members.manage', 'Invite, change roles, and remove members'),
  ('billing.manage', 'Manage subscriptions, payment methods, and checkout'),
  ('installations.manage', 'Install, configure, and remove product installations')
on conflict (key) do nothing;

insert into products (key, name) values
  ('compute', 'KpnCompute'),
  ('scena', 'Scena'),
  ('lunchvoice', 'LunchVoice'),
  ('tradora', 'Tradora')
on conflict (key) do nothing;

insert into product_plans (product_id, key, name)
select p.id, plan.key, plan.name
from products p
join (values
  ('compute', 'starter', 'Starter'),
  ('compute', 'business', 'Business'),
  ('scena', 'starter', 'Starter'),
  ('scena', 'pro', 'Pro'),
  ('lunchvoice', 'starter', 'Starter'),
  ('lunchvoice', 'district', 'District'),
  ('tradora', 'preview', 'Preview')
) as plan(product_key, key, name) on plan.product_key = p.key
on conflict (product_id, key) do nothing;

-- Native OAuth clients are registered in Supabase Authentication > OAuth
-- Server. They are not application seed data.
