import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { EnvRecord } from '@kpn/config';
import type { Id, WorkforceStaffSession } from '@kpn/contracts';
import type {
  OAuthAuthorizationCodeRecord,
  OAuthAuthorizationRequestRecord,
  OAuthClientRecord,
  OAuthRefreshTokenRecord,
  OAuthRepository,
  WorkforceAuthRepository,
} from '../repositories/types';
import { ApiError } from '../lib/errors';
import { deriveCodeChallengeS256, expiryFromNow, hashOpaqueSecret } from './oauth-protocol';
import {
  completeWorkforceAuthorization,
  createAuthorizationRequest,
  exchangeAuthorizationCode,
  refreshWorkforceTokens,
  revokeRefreshToken,
} from './oauth';

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const env: EnvRecord = {
  NODE_ENV: 'test',
  WORKFORCE_JWT_PRIVATE_KEY: privateKey,
  WORKFORCE_JWT_PUBLIC_KEY: publicKey,
  WORKFORCE_JWT_KEY_ID: 'test-key',
  WORKFORCE_JWT_ISSUER: 'https://auth.test.kpnsolute.com',
};

const TENANT_ID = randomUUID();
const INSTALLATION_ID = randomUUID();
const STAFF_ID = randomUUID();
const REDIRECT_URI = 'https://lunchvoice.kpnsolute.com/mjcc/sso';
const STATE = 'state-value-that-is-long-enough';
const NONCE = 'nonce-value-that-is-long-enough';

function verifier(): string {
  return randomBytes(32).toString('base64url');
}

function session(overrides: Partial<WorkforceStaffSession> = {}): WorkforceStaffSession {
  return {
    id: randomUUID(),
    tokenJti: randomUUID(),
    tenantId: TENANT_ID,
    staffAccountId: STAFF_ID,
    installationId: INSTALLATION_ID,
    serviceKey: 'lunchvoice',
    serviceRole: 'manager',
    issuedAt: new Date().toISOString(),
    expiresAt: expiryFromNow(900),
    revokedAt: null,
    ...overrides,
  };
}

/** Minimal in-memory OAuth store with the same atomicity guarantees as the SQL one. */
class FakeOAuthRepository implements OAuthRepository {
  clients = new Map<string, OAuthClientRecord>();
  requests = new Map<Id, OAuthAuthorizationRequestRecord>();
  codes = new Map<string, OAuthAuthorizationCodeRecord>();
  families = new Map<
    Id,
    { status: 'active' | 'revoked'; tokenUse: string; sessionId: Id | null }
  >();
  refreshTokens = new Map<string, OAuthRefreshTokenRecord>();
  sessions = new Map<Id, WorkforceStaffSession>();

  async findClientByClientId(clientId: string) {
    return this.clients.get(clientId) ?? null;
  }

  async createAuthorizationRequest(
    input: Parameters<OAuthRepository['createAuthorizationRequest']>[0],
  ) {
    const record: OAuthAuthorizationRequestRecord = {
      id: randomUUID(),
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      state: input.state,
      nonce: input.nonce,
      scope: input.scope,
      requestedTokenUse: input.requestedTokenUse,
      serviceKey: input.serviceKey,
      tenantHint: input.tenantHint,
      status: 'pending',
      expiresAt: input.expiresAt,
    };
    this.requests.set(record.id, record);
    return record;
  }

  async findAuthorizationRequest(id: Id) {
    return this.requests.get(id) ?? null;
  }

  async markAuthorizationRequest(id: Id, status: 'authorized' | 'failed' | 'expired') {
    const record = this.requests.get(id);
    if (record) record.status = status;
  }

  async createAuthorizationCode(input: Parameters<OAuthRepository['createAuthorizationCode']>[0]) {
    this.codes.set(input.codeHash, {
      id: randomUUID(),
      requestId: input.requestId,
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      nonce: input.nonce,
      tokenUse: input.tokenUse,
      consumerUserId: input.consumerUserId ?? null,
      workforceSessionId: input.workforceSessionId ?? null,
      tenantId: input.tenantId ?? null,
      installationId: input.installationId ?? null,
      expiresAt: input.expiresAt,
      consumedAt: null,
    });
  }

  async consumeAuthorizationCode(codeHash: string) {
    const record = this.codes.get(codeHash);
    // Already-consumed codes return null, exactly as the SQL conditional update does.
    if (!record || record.consumedAt) return null;
    record.consumedAt = new Date().toISOString();
    return { ...record, consumedAt: null };
  }

  async createRefreshFamily(input: Parameters<OAuthRepository['createRefreshFamily']>[0]) {
    const id = randomUUID();
    this.families.set(id, {
      status: 'active',
      tokenUse: input.tokenUse,
      sessionId: input.workforceSessionId ?? null,
    });
    return id;
  }

  async issueRefreshToken(input: Parameters<OAuthRepository['issueRefreshToken']>[0]) {
    const id = randomUUID();
    const family = this.families.get(input.familyId);
    this.refreshTokens.set(input.tokenHash, {
      id,
      familyId: input.familyId,
      generation: input.generation,
      expiresAt: input.expiresAt,
      consumedAt: null,
      familyStatus: family?.status ?? 'active',
      tokenUse: family?.tokenUse ?? 'workforce',
      workforceSessionId: family?.sessionId ?? null,
      consumerUserId: null,
      tenantId: TENANT_ID,
      installationId: INSTALLATION_ID,
    });
    return id;
  }

  async findRefreshToken(tokenHash: string) {
    const record = this.refreshTokens.get(tokenHash);
    if (!record) return null;
    return { ...record, familyStatus: this.families.get(record.familyId)?.status ?? 'revoked' };
  }

  async consumeRefreshToken(tokenHash: string) {
    const record = this.refreshTokens.get(tokenHash);
    if (!record || record.consumedAt) return null;
    record.consumedAt = new Date().toISOString();
    return record;
  }

  async revokeRefreshFamily(familyId: Id) {
    const family = this.families.get(familyId);
    if (family) family.status = 'revoked';
  }

  async findWorkforceSessionById(sessionId: Id) {
    const record = this.sessions.get(sessionId);
    if (!record || record.revokedAt) return null;
    return record;
  }
}

class FakeWorkforceRepository implements Partial<WorkforceAuthRepository> {
  constructor(private readonly store: FakeOAuthRepository) {}
  revoked: string[] = [];

  async revokeSession(sessionId: string) {
    this.revoked.push(sessionId);
    const record = this.store.sessions.get(sessionId);
    if (record) record.revokedAt = new Date().toISOString();
  }
}

function client(overrides: Partial<OAuthClientRecord> = {}): OAuthClientRecord {
  return {
    id: randomUUID(),
    clientId: 'lunchvoice-web',
    name: 'LunchVoice',
    serviceKey: 'lunchvoice',
    clientType: 'confidential',
    allowedTokenUses: ['workforce'],
    status: 'active',
    redirectUris: [REDIRECT_URI],
    ...overrides,
  };
}

let store: FakeOAuthRepository;
let workforce: FakeWorkforceRepository;
let registered: OAuthClientRecord;

function repositories() {
  return {
    oauth: store,
    workforceAuth: workforce as unknown as WorkforceAuthRepository,
  };
}

beforeEach(() => {
  store = new FakeOAuthRepository();
  workforce = new FakeWorkforceRepository(store);
  registered = client();
  store.clients.set(registered.clientId, registered);
});

async function startRequest(overrides: Record<string, string> = {}) {
  const value = verifier();
  const view = await createAuthorizationRequest(store, {
    clientId: registered.clientId,
    redirectUri: REDIRECT_URI,
    responseType: 'code',
    codeChallenge: deriveCodeChallengeS256(value),
    codeChallengeMethod: 'S256',
    state: STATE,
    nonce: NONCE,
    service: 'lunchvoice',
    ...overrides,
  });
  return { view, codeVerifier: value };
}

/** Drive a full authorization by planting a session and minting a code directly. */
async function authorizeWithSession(requestId: string, live: WorkforceStaffSession) {
  const request = store.requests.get(requestId);
  if (!request) throw new Error('missing request');
  store.sessions.set(live.id, live);
  const code = randomBytes(32).toString('base64url');
  await store.createAuthorizationCode({
    codeHash: hashOpaqueSecret(code),
    requestId: request.id,
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    nonce: request.nonce,
    tokenUse: 'workforce',
    workforceSessionId: live.id,
    tenantId: live.tenantId,
    installationId: live.installationId,
    expiresAt: expiryFromNow(60),
  });
  await store.markAuthorizationRequest(request.id, 'authorized');
  return code;
}

describe('createAuthorizationRequest', () => {
  it('accepts a well-formed request', async () => {
    const { view } = await startRequest();
    expect(view.requestId).toBeTruthy();
    expect(view.serviceKey).toBe('lunchvoice');
  });

  it('refuses a plain PKCE downgrade', async () => {
    await expect(startRequest({ codeChallengeMethod: 'plain' })).rejects.toBeInstanceOf(ApiError);
  });

  it('refuses a response type other than code', async () => {
    await expect(startRequest({ responseType: 'token' })).rejects.toBeInstanceOf(ApiError);
  });

  it('refuses a short or missing state and nonce', async () => {
    await expect(startRequest({ state: 'short' })).rejects.toBeInstanceOf(ApiError);
    await expect(startRequest({ nonce: '' })).rejects.toBeInstanceOf(ApiError);
  });

  it('refuses an unregistered redirect URI', async () => {
    await expect(
      startRequest({ redirectUri: 'https://lunchvoice.kpnsolute.com/mjcc/sso2' }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('refuses hostile redirect URIs outright', async () => {
    for (const hostile of [
      'https://evil.test/steal',
      'http://lunchvoice.kpnsolute.com/mjcc/sso',
      'https://lunchvoice.kpnsolute.com/mjcc/sso#x',
      'javascript:alert(1)',
    ]) {
      await expect(startRequest({ redirectUri: hostile })).rejects.toBeInstanceOf(ApiError);
    }
  });

  it('refuses a client signing in to a service it does not own', async () => {
    await expect(startRequest({ service: 'scena' })).rejects.toBeInstanceOf(ApiError);
  });

  it('refuses an unknown service', async () => {
    await expect(startRequest({ service: 'nope' })).rejects.toBeInstanceOf(ApiError);
  });

  it('treats a suspended client like an unknown one', async () => {
    registered.status = 'suspended';
    await expect(startRequest()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('completeWorkforceAuthorization redirect', () => {
  it('returns the caller state and never a token in the URL', async () => {
    const { view } = await startRequest();
    const live = session();
    const code = await authorizeWithSession(view.requestId, live);
    const target = new URL(`${REDIRECT_URI}?code=${code}&state=${STATE}`);
    expect(target.searchParams.get('state')).toBe(STATE);
    expect(target.hash).toBe('');
    expect(target.toString()).not.toContain('access_token');
  });

  it('refuses to authorize an already-completed request', async () => {
    const { view } = await startRequest();
    await store.markAuthorizationRequest(view.requestId, 'authorized');
    await expect(
      completeWorkforceAuthorization(env, repositories(), {
        requestId: view.requestId,
        tenantSlug: 'mjcc',
        username: 'someone',
        pin: '123456',
        httpRequestId: 'req-1',
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('refuses an expired request', async () => {
    const { view } = await startRequest();
    const request = store.requests.get(view.requestId);
    if (request) request.expiresAt = '2020-01-01T00:00:00.000Z';
    await expect(
      completeWorkforceAuthorization(env, repositories(), {
        requestId: view.requestId,
        tenantSlug: 'mjcc',
        username: 'someone',
        pin: '123456',
        httpRequestId: 'req-1',
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('exchangeAuthorizationCode', () => {
  it('exchanges a valid code for an access and refresh token', async () => {
    const { view, codeVerifier } = await startRequest();
    const code = await authorizeWithSession(view.requestId, session());
    const result = await exchangeAuthorizationCode(env, repositories(), {
      code,
      codeVerifier,
      clientId: registered.clientId,
      redirectUri: REDIRECT_URI,
    });
    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(result.refreshToken).toBeTruthy();
    expect(result.tenantId).toBe(TENANT_ID);
    expect(result.serviceRole).toBe('manager');
  });

  it('rejects a replayed code and does not issue a second token', async () => {
    const { view, codeVerifier } = await startRequest();
    const code = await authorizeWithSession(view.requestId, session());
    const input = {
      code,
      codeVerifier,
      clientId: registered.clientId,
      redirectUri: REDIRECT_URI,
    };
    await exchangeAuthorizationCode(env, repositories(), input);
    await expect(exchangeAuthorizationCode(env, repositories(), input)).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it('rejects a mismatched PKCE verifier', async () => {
    const { view } = await startRequest();
    const code = await authorizeWithSession(view.requestId, session());
    await expect(
      exchangeAuthorizationCode(env, repositories(), {
        code,
        codeVerifier: verifier(),
        clientId: registered.clientId,
        redirectUri: REDIRECT_URI,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('burns the code even when the exchange fails, so it cannot be retried', async () => {
    const { view, codeVerifier } = await startRequest();
    const code = await authorizeWithSession(view.requestId, session());
    await expect(
      exchangeAuthorizationCode(env, repositories(), {
        code,
        codeVerifier: verifier(),
        clientId: registered.clientId,
        redirectUri: REDIRECT_URI,
      }),
    ).rejects.toBeInstanceOf(ApiError);
    // The correct verifier must now also fail: the code is spent.
    await expect(
      exchangeAuthorizationCode(env, repositories(), {
        code,
        codeVerifier,
        clientId: registered.clientId,
        redirectUri: REDIRECT_URI,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects a redirect URI that differs from the authorization request', async () => {
    const { view, codeVerifier } = await startRequest();
    const code = await authorizeWithSession(view.requestId, session());
    await expect(
      exchangeAuthorizationCode(env, repositories(), {
        code,
        codeVerifier,
        clientId: registered.clientId,
        redirectUri: 'https://evil.test/steal',
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects an exchange by a different client', async () => {
    const other = client({ clientId: 'scena-web', serviceKey: 'scena' });
    store.clients.set(other.clientId, other);
    const { view, codeVerifier } = await startRequest();
    const code = await authorizeWithSession(view.requestId, session());
    await expect(
      exchangeAuthorizationCode(env, repositories(), {
        code,
        codeVerifier,
        clientId: other.clientId,
        redirectUri: REDIRECT_URI,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects an unknown code', async () => {
    const { codeVerifier } = await startRequest();
    await expect(
      exchangeAuthorizationCode(env, repositories(), {
        code: 'never-issued',
        codeVerifier,
        clientId: registered.clientId,
        redirectUri: REDIRECT_URI,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('refuses when the central session was revoked between authorize and exchange', async () => {
    const { view, codeVerifier } = await startRequest();
    const live = session();
    const code = await authorizeWithSession(view.requestId, live);
    await workforce.revokeSession(live.id);
    await expect(
      exchangeAuthorizationCode(env, repositories(), {
        code,
        codeVerifier,
        clientId: registered.clientId,
        redirectUri: REDIRECT_URI,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('refuses when the session belongs to a different tenant than the code', async () => {
    const { view, codeVerifier } = await startRequest();
    const live = session();
    const code = await authorizeWithSession(view.requestId, live);
    live.tenantId = randomUUID();
    await expect(
      exchangeAuthorizationCode(env, repositories(), {
        code,
        codeVerifier,
        clientId: registered.clientId,
        redirectUri: REDIRECT_URI,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('refresh rotation', () => {
  async function establish() {
    const { view, codeVerifier } = await startRequest();
    const live = session();
    const code = await authorizeWithSession(view.requestId, live);
    const tokens = await exchangeAuthorizationCode(env, repositories(), {
      code,
      codeVerifier,
      clientId: registered.clientId,
      redirectUri: REDIRECT_URI,
    });
    return { tokens, live };
  }

  it('rotates to a new refresh token', async () => {
    const { tokens } = await establish();
    const next = await refreshWorkforceTokens(env, repositories(), {
      refreshToken: tokens.refreshToken,
      clientId: registered.clientId,
    });
    expect(next.refreshToken).not.toBe(tokens.refreshToken);
    expect(next.accessToken.split('.')).toHaveLength(3);
  });

  it('revokes the whole family and the session when a token is reused', async () => {
    const { tokens, live } = await establish();
    const rotated = await refreshWorkforceTokens(env, repositories(), {
      refreshToken: tokens.refreshToken,
      clientId: registered.clientId,
    });
    // Replaying the original, already-consumed token is the compromise signal.
    await expect(
      refreshWorkforceTokens(env, repositories(), {
        refreshToken: tokens.refreshToken,
        clientId: registered.clientId,
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(workforce.revoked).toContain(live.id);
    // The rotated token must now be dead too, because the family was revoked.
    await expect(
      refreshWorkforceTokens(env, repositories(), {
        refreshToken: rotated.refreshToken,
        clientId: registered.clientId,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects an unknown refresh token', async () => {
    await expect(
      refreshWorkforceTokens(env, repositories(), {
        refreshToken: 'never-issued',
        clientId: registered.clientId,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects refresh after the session is revoked', async () => {
    const { tokens, live } = await establish();
    await workforce.revokeSession(live.id);
    await expect(
      refreshWorkforceTokens(env, repositories(), {
        refreshToken: tokens.refreshToken,
        clientId: registered.clientId,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('revokes on request and is idempotent for unknown tokens', async () => {
    const { tokens, live } = await establish();
    await revokeRefreshToken(repositories(), tokens.refreshToken);
    expect(workforce.revoked).toContain(live.id);
    await expect(revokeRefreshToken(repositories(), 'never-issued')).resolves.toBeUndefined();
  });
});
