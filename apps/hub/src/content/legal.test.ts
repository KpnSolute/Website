import { describe, expect, it } from 'vitest';
import { LEGAL_UPDATED, PRIVACY, TERMS, type LegalDoc } from './legal';

const text = (doc: LegalDoc) =>
  [
    doc.intro,
    ...doc.sections.flatMap((s) => [
      s.heading,
      ...s.blocks.flatMap((b) => ('p' in b ? [b.p] : b.ul)),
    ]),
  ].join('\n');

describe('privacy policy and terms of service', () => {
  it('make no company-entity claim and name no customer', () => {
    for (const doc of [PRIVACY, TERMS]) {
      expect(text(doc)).not.toMatch(/\bLLC\b|\bInc\b|Corporation|KpnLLC/);
      expect(text(doc)).not.toMatch(/MJCC|Miami|Job Corps|LionCafe/i);
    }
  });

  it('contain no placeholder text', () => {
    for (const doc of [PRIVACY, TERMS]) {
      expect(text(doc)).not.toMatch(/TODO|TBD|lorem|\[[A-Za-z ]+\]|xxx|your company name|insert/i);
    }
  });

  it('privacy policy keeps the Google sign-in disclosures reviewers look for', () => {
    const t = text(PRIVACY);
    expect(t).toMatch(/openid, email, and profile/);
    expect(t).toMatch(/Google API Services User Data Policy/);
    expect(t).toMatch(/Limited Use/);
    expect(t).toMatch(/myaccount\.google\.com\/permissions/);
    expect(t).toMatch(/do not sell/i);
    expect(t).toMatch(/delete/i);
  });

  it('privacy policy names the real service providers and the United States', () => {
    const t = text(PRIVACY);
    for (const provider of ['Supabase', 'Render', 'Cloudflare']) expect(t).toContain(provider);
    expect(t).toMatch(/United States/);
  });

  it('terms cover the account, acceptable use, ownership of customer materials and limits', () => {
    const headings = TERMS.sections.map((s) => s.heading);
    for (const heading of [
      'Your account',
      'Using the services',
      'Your materials and ours',
      'Limits on our liability',
      'Ending your use',
    ]) {
      expect(headings).toContain(heading);
    }
    expect(text(TERMS)).toMatch(/at least 13/);
    expect(text(TERMS)).toMatch(/stays yours/);
  });

  it('both end with a contact section and carry a date', () => {
    for (const doc of [PRIVACY, TERMS]) {
      expect(doc.sections.at(-1)?.contact).toBe(true);
      expect(new Set(doc.sections.map((s) => s.id)).size).toBe(doc.sections.length);
    }
    expect(LEGAL_UPDATED).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/);
  });
});
