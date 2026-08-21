import type { Id, WorkforceServiceKey, WorkforceStaffSession } from '@kpn/contracts';
import { requireRow, type Db } from '../../db/pool.js';
import type {
  OAuthAuthorizationCodeRecord,
  OAuthAuthorizationRequestRecord,
  OAuthClientRecord,
  OAuthRefreshTokenRecord,
  OAuthRepository,
} from '../types.js';

interface ClientRow {
  id: string;
  client_id: string;
  name: string;
  service_key: string | null;
  client_type: 'confidential' | 'public';
  allowed_token_uses: string[];
  status: 'active' | 'suspended' | 'retired';
  redirect_uris: string[] | null;
}

interface RequestRow {
  id: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  state: string;
  nonce: string;
  scope: string;
  requested_token_use: string;
  service_key: string | null;
  tenant_hint: string | null;
  status: 'pending' | 'authorized' | 'failed' | 'expired';
  expires_at: string;
}

interface CodeRow {
  id: string;
  request_id: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  nonce: string;
  token_use: string;
  consumer_user_id: string | null;
  workforce_session_id: string | null;
  tenant_id: string | null;
  installation_id: string | null;
  expires_at: string;
  consumed_at: string | null;
}

interface RefreshRow {
  id: string;
  family_id: string;
  generation: number;
  expires_at: string;
  consumed_at: string | null;
  family_status: 'active' | 'revoked';
  token_use: string;
  workforce_session_id: string | null;
  consumer_user_id: string | null;
  tenant_id: string | null;
  installation_id: string | null;
}

interface SessionRow {
  id: string;
  token_jti: string;
  tenant_id: string;
  staff_account_id: string;
  installation_id: string;
  service_key: string;
  service_role: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
}

function toClient(row: ClientRow): OAuthClientRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    serviceKey: (row.service_key as WorkforceServiceKey | null) ?? null,
    clientType: row.client_type,
    allowedTokenUses: row.allowed_token_uses,
    status: row.status,
    redirectUris: row.redirect_uris ?? [],
  };
}

function toRequest(row: RequestRow): OAuthAuthorizationRequestRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    state: row.state,
    nonce: row.nonce,
    scope: row.scope,
    requestedTokenUse: row.requested_token_use,
    serviceKey: (row.service_key as WorkforceServiceKey | null) ?? null,
    tenantHint: row.tenant_hint,
    status: row.status,
    expiresAt: row.expires_at,
  };
}

function toCode(row: CodeRow): OAuthAuthorizationCodeRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    clientId: row.client_id,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    nonce: row.nonce,
    tokenUse: row.token_use,
    consumerUserId: row.consumer_user_id,
    workforceSessionId: row.workforce_session_id,
    tenantId: row.tenant_id,
    installationId: row.installation_id,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  };
}

function toRefresh(row: RefreshRow): OAuthRefreshTokenRecord {
  return {
    id: row.id,
    familyId: row.family_id,
    generation: row.generation,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    familyStatus: row.family_status,
    tokenUse: row.token_use,
    workforceSessionId: row.workforce_session_id,
    consumerUserId: row.consumer_user_id,
    tenantId: row.tenant_id,
    installationId: row.installation_id,
  };
}

export function createOAuthRepository(db: Db): OAuthRepository {
  return {
    async findClientByClientId(clientId) {
      const rows = await db.query<ClientRow>(
        `select client.id,
                client.client_id,
                client.name,
                client.service_key,
                client.client_type,
                client.allowed_token_uses,
                client.status,
                coalesce(
                  array_agg(uri.redirect_uri) filter (where uri.redirect_uri is not null),
                  '{}'
                ) as redirect_uris
           from oauth_clients client
           left join oauth_client_redirect_uris uri on uri.client_id = client.id
          where client.client_id = $1
          group by client.id`,
        [clientId],
      );
      const row = rows[0];
      return row ? toClient(row) : null;
    },

    async createAuthorizationRequest(input) {
      const rows = await db.query<RequestRow>(
        `insert into private.oauth_authorization_requests
           (client_id, redirect_uri, code_challenge, state, nonce, scope,
            requested_token_use, service_key, tenant_hint, expires_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning *`,
        [
          input.clientId,
          input.redirectUri,
          input.codeChallenge,
          input.state,
          input.nonce,
          input.scope,
          input.requestedTokenUse,
          input.serviceKey,
          input.tenantHint,
          input.expiresAt,
        ],
      );
      return toRequest(requireRow(rows));
    },

    async findAuthorizationRequest(id) {
      const rows = await db.query<RequestRow>(
        `select * from private.oauth_authorization_requests where id = $1`,
        [id],
      );
      const row = rows[0];
      return row ? toRequest(row) : null;
    },

    async markAuthorizationRequest(id, status, failureReason) {
      await db.query(
        `update private.oauth_authorization_requests
            set status = $2, failure_reason = $3
          where id = $1`,
        [id, status, failureReason ?? null],
      );
    },

    async createAuthorizationCode(input) {
      await db.query(
        `insert into private.oauth_authorization_codes
           (code_hash, request_id, client_id, redirect_uri, code_challenge, nonce,
            token_use, consumer_user_id, workforce_session_id, tenant_id,
            installation_id, expires_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          input.codeHash,
          input.requestId,
          input.clientId,
          input.redirectUri,
          input.codeChallenge,
          input.nonce,
          input.tokenUse,
          input.consumerUserId ?? null,
          input.workforceSessionId ?? null,
          input.tenantId ?? null,
          input.installationId ?? null,
          input.expiresAt,
        ],
      );
    },

    /**
     * Single-use enforcement lives in this conditional update. Two concurrent
     * exchanges of the same code cannot both match `consumed_at is null`, so
     * exactly one wins and the other receives null.
     */
    async consumeAuthorizationCode(codeHash, outcome) {
      const rows = await db.query<CodeRow>(
        `update private.oauth_authorization_codes
            set consumed_at = now(), consumed_outcome = $2
          where code_hash = $1 and consumed_at is null
          returning *`,
        [codeHash, outcome],
      );
      const row = rows[0];
      // consumed_at is echoed back as null so the caller sees the pre-consume
      // state it just claimed, rather than believing the code was already used.
      return row ? { ...toCode(row), consumedAt: null } : null;
    },

    async createRefreshFamily(input) {
      const rows = await db.query<{ id: string }>(
        `insert into private.oauth_refresh_families
           (client_id, token_use, consumer_user_id, workforce_session_id,
            tenant_id, installation_id)
         values ($1, $2, $3, $4, $5, $6)
         returning id`,
        [
          input.clientId,
          input.tokenUse,
          input.consumerUserId ?? null,
          input.workforceSessionId ?? null,
          input.tenantId ?? null,
          input.installationId ?? null,
        ],
      );
      return requireRow(rows).id;
    },

    async issueRefreshToken(input) {
      return db.transaction(async (tx) => {
        const rows = await tx.query<{ id: string }>(
          `insert into private.oauth_refresh_tokens
             (family_id, token_hash, generation, expires_at)
           values ($1, $2, $3, $4)
           returning id`,
          [input.familyId, input.tokenHash, input.generation, input.expiresAt],
        );
        const id = requireRow(rows).id;
        if (input.replacesId) {
          await tx.query(
            `update private.oauth_refresh_tokens set replaced_by_id = $2 where id = $1`,
            [input.replacesId, id],
          );
        }
        return id;
      });
    },

    async findRefreshToken(tokenHash) {
      const rows = await db.query<RefreshRow>(
        `select token.id,
                token.family_id,
                token.generation,
                token.expires_at,
                token.consumed_at,
                family.status as family_status,
                family.token_use,
                family.workforce_session_id,
                family.consumer_user_id,
                family.tenant_id,
                family.installation_id
           from private.oauth_refresh_tokens token
           join private.oauth_refresh_families family on family.id = token.family_id
          where token.token_hash = $1`,
        [tokenHash],
      );
      const row = rows[0];
      return row ? toRefresh(row) : null;
    },

    /** Same conditional-update guarantee as authorization codes. */
    async consumeRefreshToken(tokenHash) {
      const rows = await db.query<RefreshRow>(
        `with consumed as (
           update private.oauth_refresh_tokens
              set consumed_at = now()
            where token_hash = $1 and consumed_at is null
            returning id, family_id, generation, expires_at, consumed_at
         )
         select consumed.id,
                consumed.family_id,
                consumed.generation,
                consumed.expires_at,
                consumed.consumed_at,
                family.status as family_status,
                family.token_use,
                family.workforce_session_id,
                family.consumer_user_id,
                family.tenant_id,
                family.installation_id
           from consumed
           join private.oauth_refresh_families family on family.id = consumed.family_id`,
        [tokenHash],
      );
      const row = rows[0];
      return row ? toRefresh(row) : null;
    },

    async revokeRefreshFamily(familyId, reason) {
      await db.query(
        `update private.oauth_refresh_families
            set status = 'revoked', revoked_at = now(), revoke_reason = $2
          where id = $1 and status = 'active'`,
        [familyId, reason],
      );
    },

    async findWorkforceSessionById(sessionId: Id): Promise<WorkforceStaffSession | null> {
      const rows = await db.query<SessionRow>(
        `select session.id,
                session.token_jti,
                session.tenant_id,
                session.staff_account_id,
                session.installation_id,
                product.key as service_key,
                assignment.service_role,
                session.issued_at,
                session.expires_at,
                session.revoked_at
           from private.workforce_sessions session
           join product_installations installation on installation.id = session.installation_id
           join products product on product.id = installation.product_id
           join workforce_installation_assignments assignment
             on assignment.installation_id = session.installation_id
            and assignment.staff_account_id = session.staff_account_id
          where session.id = $1
            and session.revoked_at is null
            and session.expires_at > now()
            and assignment.status = 'active'`,
        [sessionId],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        tokenJti: row.token_jti,
        tenantId: row.tenant_id,
        staffAccountId: row.staff_account_id,
        installationId: row.installation_id,
        serviceKey: row.service_key as WorkforceServiceKey,
        serviceRole: row.service_role,
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
      };
    },
  };
}
