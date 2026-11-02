import { describe, expect, it } from 'vitest';
import * as site from './site';

/** All public copy as one string, for rule checks. */
function allCopy(): string {
  return JSON.stringify([
    site.MISSION,
    site.MISSION_DETAIL,
    site.WHAT_WE_ARE,
    site.GOALS,
    site.VISION,
    site.PRINCIPLES,
    site.PRODUCTS,
    site.PARTNER_PATHS,
    site.PARTNERS,
    site.SHARED_SERVICES,
  ]);
}

describe('public site content rules (Loom LEGAL_STATUS_AND_IP, ADR-0002, PRODUCT_CHARTERS)', () => {
  it('never claims a company entity: KpnLLC is not a formed legal entity', () => {
    const copy = allCopy();
    expect(copy).not.toMatch(/\bLLC\b/i);
    expect(copy).not.toMatch(/\b(Inc\.?|Incorporated|Corporation|Ltd\.?|GmbH)\b/);
    expect(copy).not.toMatch(/KpnLLC/);
  });

  it('names no customer: customers are independent and their materials private', () => {
    const copy = allCopy();
    expect(copy).not.toMatch(/MJCC|Miami|Job Corps|LionCafe/i);
  });

  it('lists no partner until one is approved: the list is empty and customers are not partners', () => {
    expect(site.PARTNERS).toEqual([]);
  });

  it('describes products by purpose and does not overclaim', () => {
    expect(site.PRODUCTS.map((p) => p.key)).toEqual(['compute', 'scena', 'tradora', 'lunchvoice']);
    const copy = allCopy();
    expect(copy).not.toMatch(
      /guarantee|guaranteed|best[- ]in[- ]class|world[- ]class|Canva|OBS\b|risk[- ]free|returns/i,
    );
    const tradora = site.PRODUCTS.find((p) => p.key === 'tradora');
    expect(tradora?.note).toMatch(/not financial advice/i);
  });

  it('uses customer-facing words, not internal architecture terms', () => {
    expect(allCopy()).not.toMatch(/\btenants?\b(?!-safe|-scoped)/i);
  });

  it('has a mission that matches the product charters', () => {
    expect(site.MISSION).toBe('Keeping People Navigated.');
  });

  it('every product has a purpose and an audience', () => {
    for (const product of site.PRODUCTS) {
      expect(product.purpose.length).toBeGreaterThan(40);
      expect(product.audience.length).toBeGreaterThan(20);
    }
  });
});
