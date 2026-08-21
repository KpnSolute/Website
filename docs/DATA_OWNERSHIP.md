# KpnSolute data ownership

The KpnAuth Supabase project is the KpnSolute control-plane database. It owns
facts that must be consistent across every product:

- people and authentication links;
- tenants, memberships, roles, and invitations;
- products, plans, installations, per-user installation assignments, and
  entitlements;
- subscriptions, invoices, payment references, and usage summaries;
- API keys, webhooks, custom domains, notifications, and audit records;
- legacy service identity mappings during migration;
- tenant-owned workforce staff identities, installation assignments, login
  policy, private credential hashes, revocable staff sessions, and auth audit;
- discoverable references to service-owned resources; and
- a private transactional outbox for KpnLink delivery.

## Product databases remain authoritative

The control plane stores a resource identifier and safe summary, not the
resource payload. Each product remains the authority for its operational data:

| Service        | Service-owned examples                                                   |
| -------------- | ------------------------------------------------------------------------ |
| Scena          | boards, scenes, assets, displays, sessions, playback, telemetry          |
| KpnCompute     | projects, SOP files, generated artifacts, workflows, operational records |
| LunchVoice     | surveys, responses, rewards, audience analytics                          |
| Tradora        | research, strategies, portfolios, paper orders, market data              |
| KpnLink/Events | CloudEvents transport state, retries, signatures, delivery attempts      |

Every service-owned row must carry or resolve both the immutable KpnSolute
tenant ID and product-installation ID. A tenant slug, hostname, request header,
or client-provided ID is routing context—not authorization.

## Synchronization contract

Control-plane mutations write a CloudEvent-shaped record to
`private.control_plane_outbox` in the same database transaction. A trusted
publisher will deliver those records to KpnLink/Events. Product services use
idempotent consumers and keep their own inbox/deduplication records in their
service database.

The fixed Cloudflare gateway is never configured from this database. Its
service-to-origin registry remains reviewed source code so a tenant or database
row cannot redirect gateway traffic.

## Migration rule

Existing service identities may be linked through `service_identity_links`.
Tenant staff identities use `workforce_legacy_identity_links` because a staff
member may not have a consumer `account_profiles` record. The mapping preserves
the product's immutable legacy subject while KpnAuth becomes the authentication
authority.
Operational product rows are not copied into KpnAuth. Products migrate one at a
time, retain compatibility routes until authenticated read/write acceptance,
and remove a legacy identity or origin only after rollback evidence exists.
