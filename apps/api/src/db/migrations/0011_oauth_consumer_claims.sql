-- Consumer (person) sign-in claims captured at authorization time.
--
-- The identity claims that go into a relying party's ID token (email, whether
-- that email is verified, display name, picture) are read from the freshly
-- verified KpnAuth session when the person approves the sign-in, and stored on
-- the single-use code. The token exchange copies them into the ID token. This
-- keeps email_verified fresh (never a cached value from an older sign-in) and
-- lets the exchange run without a second round-trip to the identity provider.
alter table private.oauth_authorization_codes
  add column consumer_claims jsonb
    check (consumer_claims is null or jsonb_typeof(consumer_claims) = 'object');

comment on column private.oauth_authorization_codes.consumer_claims is
  'email, email_verified, name, picture captured from the verified session at authorization; consumer codes only';
