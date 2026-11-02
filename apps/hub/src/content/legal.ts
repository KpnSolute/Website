/**
 * Privacy Policy and Terms of Service for kpnsolute.com and the shared KpnSolute account.
 *
 * Plain-language drafts written from what the system actually does (Supabase Auth for the shared account in
 * the United States, Render hosting, no advertising or analytics trackers). They are not legal advice and must
 * be reviewed by counsel before being relied on; see docs/PUBLIC_SITE.md for the points counsel should check.
 *
 * Rules (enforced by legal.test.ts): no company-entity claim, no placeholders, every promise here is one the
 * system can keep, and the Google sign-in disclosures stay present.
 */

export const LEGAL_UPDATED = '2 November 2026';

export type Block = { p: string } | { ul: string[] };

export interface LegalSection {
  id: string;
  heading: string;
  blocks: Block[];
  /** Renders the contact address (from VITE_CONTACT_EMAIL) after the blocks. */
  contact?: boolean;
}

export interface LegalDoc {
  title: string;
  description: string;
  intro: string;
  sections: LegalSection[];
}

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  description: 'What personal information KpnSolute handles, why, and the choices you have.',
  intro:
    'KpnSolute (“we”, “us”) builds software products and the shared account behind them. This policy explains what personal information we handle when you visit kpnsolute.com, create a KpnSolute account, or sign in to a KpnSolute product. Some products hold their own information about how you use them; where a product has its own privacy policy, that policy covers it.',
  sections: [
    {
      id: 'information',
      heading: 'Information we handle',
      blocks: [
        {
          p: 'Account information. When you create an account we handle your email address and name. If you use an email and password, your password is stored only as a protected hash; we cannot read it.',
        },
        {
          p: 'Sign-in with Google. If you choose “Continue with Google”, Google tells us your name, your email address, whether Google has verified that address, your profile picture address, and that you signed in. We request only the basic Google scopes openid, email, and profile. We do not ask for, or have access to, your Gmail, Drive, Calendar, Contacts, or anything else in your Google account.',
        },
        {
          p: 'Sign-in and security records. When you sign in we record the time, which product you signed in to, and basic technical details that your browser sends, such as your IP address and browser type. We use these to keep accounts secure.',
        },
        {
          p: 'Messages you send us. If you email us, we keep the message and our reply so we can help you.',
        },
        {
          p: 'What a product receives. When you sign in to a KpnSolute product, we give that product a signed token containing a unique account identifier, your name, your email address, whether the address is verified, and your profile picture address if there is one. The product does not receive your password.',
        },
        {
          p: 'Browser storage. We use your browser’s storage to keep you signed in and to complete the steps of signing in. We do not use advertising cookies, and kpnsolute.com does not use third-party analytics or advertising trackers.',
        },
      ],
    },
    {
      id: 'use',
      heading: 'How we use it',
      blocks: [
        {
          ul: [
            'To create your account and sign you in to KpnSolute products.',
            'To keep accounts and systems secure, and to detect and prevent abuse.',
            'To respond to you and provide support.',
            'To meet legal obligations.',
          ],
        },
        { p: 'We do not sell your personal information, and we do not use it for advertising.' },
      ],
    },
    {
      id: 'google',
      heading: 'Google user data',
      blocks: [
        {
          p: 'KpnSolute’s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. We use the Google information described above only to create your account and sign you in. We do not use it for advertising, and we do not transfer it to others except as described in this policy or as needed to provide the sign-in you asked for.',
        },
        {
          p: 'You can remove KpnSolute’s access to your Google account at any time at myaccount.google.com/permissions.',
        },
      ],
    },
    {
      id: 'sharing',
      heading: 'Who we share it with',
      blocks: [
        { p: 'We share personal information only with:' },
        {
          ul: [
            'Service providers that run our systems for us: Supabase (account sign-in and database), Render (website and application hosting), and Cloudflare (domain and network services). They may handle your information only to provide those services to us.',
            'Google, when you choose to sign in with Google.',
            'The KpnSolute product you sign in to, as described above.',
            'Authorities or other parties where the law requires it, or where it is necessary to protect people or our systems.',
            'A successor, if KpnSolute’s business is reorganized or transferred. We would tell you first, and this policy would continue to apply to your information.',
          ],
        },
      ],
    },
    {
      id: 'where',
      heading: 'Where information is kept',
      blocks: [
        {
          p: 'Our service providers process your information in the United States. If you use KpnSolute from another country, your information is transferred there.',
        },
      ],
    },
    {
      id: 'retention',
      heading: 'How long we keep it, and deletion',
      blocks: [
        {
          p: 'We keep your account information for as long as your account exists. You can ask us to delete your account at any time, and we will delete your account information. A minimal record of security events may be kept after deletion where it is needed to protect other accounts or to prevent abuse. Messages you have sent us are kept for as long as needed to help you and then deleted.',
        },
      ],
    },
    {
      id: 'rights',
      heading: 'Your choices',
      blocks: [
        {
          p: 'You can ask us to give you a copy of your information, correct it, or delete it, and you can withdraw Google access as described above. Contact us using the details below. We aim to reply within 30 days.',
        },
      ],
    },
    {
      id: 'security',
      heading: 'Security',
      blocks: [
        {
          p: 'Passwords are stored as protected hashes, connections to our sites are encrypted, and access to our systems is limited to people who need it. No system is perfectly secure, so we also monitor sign-ins for abuse and fix problems promptly.',
        },
      ],
    },
    {
      id: 'children',
      heading: 'Children',
      blocks: [
        {
          p: 'KpnSolute accounts are for people aged 13 and over. We do not knowingly collect personal information from children under 13 for a KpnSolute account. If you believe a child has given us information, contact us and we will delete it. Products used by schools may have their own rules; those are described by the product.',
        },
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to this policy',
      blocks: [
        {
          p: 'If we change this policy we will update the date at the top of the page, and for important changes we will tell you in the product or by email before they take effect.',
        },
      ],
    },
    {
      id: 'contact',
      heading: 'Contact us',
      blocks: [{ p: 'Questions about privacy, or a request about your information:' }],
      contact: true,
    },
  ],
};

export const TERMS: LegalDoc = {
  title: 'Terms of Service',
  description: 'The terms for using kpnsolute.com, the KpnSolute account, and KpnSolute products.',
  intro:
    'These terms apply when you use kpnsolute.com, a KpnSolute account, or a KpnSolute product (together, the “services”). By using the services you agree to them. If you use the services for an organization, you confirm that you are allowed to accept these terms for it. A product may have extra terms; if so, they apply to that product as well.',
  sections: [
    {
      id: 'account',
      heading: 'Your account',
      blocks: [
        {
          ul: [
            'You must be at least 13 years old to have a KpnSolute account.',
            'Give accurate information and keep it up to date.',
            'Keep your sign-in details private. You are responsible for what happens under your account, so tell us right away if you think it has been misused.',
            'An account belongs to one person. Do not share it or sell access to it.',
          ],
        },
      ],
    },
    {
      id: 'use',
      heading: 'Using the services',
      blocks: [
        { p: 'Use the services lawfully and with respect for others. Do not:' },
        {
          ul: [
            'break the law, or help anyone else to;',
            'try to get into accounts, data, or systems that are not yours, or get around security;',
            'overload, disrupt, or damage the services, or send malware through them;',
            'copy, resell, or reverse engineer the services, except where the law allows it; or',
            'use the services to harass people, or to share content you have no right to share.',
          ],
        },
      ],
    },
    {
      id: 'materials',
      heading: 'Your materials and ours',
      blocks: [
        {
          p: 'What you put into the services stays yours: your documents, records, procedures, data, and branding. You allow us to host and process them only as needed to provide the services to you. We do not use your materials to serve other customers.',
        },
        {
          p: 'We own the software, designs, names, and logos that make up the services, and the general methods we develop in building them. These terms do not give you ownership of them; they give you the right to use the services as intended while you follow these terms.',
        },
      ],
    },
    {
      id: 'products',
      heading: 'Products, changes, and availability',
      blocks: [
        {
          p: 'KpnSolute products are at different stages. We may add, change, pause, or end features, and we will try to give notice of significant changes. We work to keep the services available, but we do not promise they will always be uninterrupted or error-free.',
        },
      ],
    },
    {
      id: 'advice',
      heading: 'Not professional advice',
      blocks: [
        {
          p: 'Some products provide research, information, or tools. Nothing in the services is financial, investment, legal, medical, or other professional advice. Make your own decisions, and ask a qualified professional where it matters.',
        },
      ],
    },
    {
      id: 'thirdparty',
      heading: 'Third-party services',
      blocks: [
        {
          p: 'The services work with third-party services such as Google sign-in. Those services have their own terms and privacy policies, which apply to your use of them.',
        },
      ],
    },
    {
      id: 'paid',
      heading: 'Paid plans',
      blocks: [
        {
          p: 'Paid plans are not available yet. Before anything is charged, we will show you the price and the terms clearly and ask for your agreement.',
        },
      ],
    },
    {
      id: 'ending',
      heading: 'Ending your use',
      blocks: [
        {
          p: 'You can stop using the services at any time and ask us to delete your account. We may suspend or end access if you break these terms, if your use puts others or our systems at risk, or if the law requires it. We will tell you why where we can.',
        },
      ],
    },
    {
      id: 'warranty',
      heading: 'No warranty',
      blocks: [
        {
          p: 'To the extent the law allows, the services are provided “as is” and “as available”, without promises that they will meet your needs or be free of faults.',
        },
      ],
    },
    {
      id: 'liability',
      heading: 'Limits on our liability',
      blocks: [
        {
          p: 'To the extent the law allows, KpnSolute is not liable for indirect or consequential losses, lost profits, or lost data arising from your use of the services. Where we are liable, our total liability is limited to the amount you paid us for the services in the 12 months before the claim, or to 100 US dollars if you paid nothing. Nothing in these terms limits a right or liability that the law does not allow us to limit.',
        },
      ],
    },
    {
      id: 'changes',
      heading: 'Changes to these terms',
      blocks: [
        {
          p: 'We may update these terms. We will change the date at the top of the page, and for important changes we will tell you in the product or by email before they take effect. If you keep using the services after a change takes effect, you accept the updated terms.',
        },
      ],
    },
    {
      id: 'contact',
      heading: 'Contact us',
      blocks: [{ p: 'Questions about these terms:' }],
      contact: true,
    },
  ],
};
