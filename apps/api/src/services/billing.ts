import Stripe from 'stripe';
import { readEnv, type EnvRecord } from '@kpn/config';
import { ApiError } from '../lib/errors.js';

let stripeClient: Stripe | undefined;

export function getStripeClient(env: EnvRecord): Stripe {
  const secretKey = readEnv(env, 'STRIPE_SECRET_KEY');
  if (!secretKey) {
    throw ApiError.setupRequired('Stripe billing');
  }
  stripeClient ??= new Stripe(secretKey);
  return stripeClient;
}

export interface CheckoutInput {
  tenantId: string;
  tenantSlug: string;
  planName: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail: string;
}

export async function createCheckoutSession(
  env: EnvRecord,
  input: CheckoutInput,
): Promise<{ url: string }> {
  const stripe = getStripeClient(env);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer_email: input.customerEmail,
    client_reference_id: input.tenantId,
    metadata: { tenantSlug: input.tenantSlug, planName: input.planName },
  });
  if (!session.url) {
    throw new ApiError(502, 'unknown_error', 'Stripe did not return a checkout URL.');
  }
  return { url: session.url };
}
