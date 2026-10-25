import {
  CODE_HOST,
  COMPANY_NAME,
  LAPSE_RETENTION_MONTHS,
  LEGAL_EFFECTIVE,
  PRODUCT_NAME,
  SUPPORT_EMAIL,
} from "@/lib/brand";
import { CODE_LENGTH } from "@/lib/short-code";

/**
 * The legal pages, as content rather than markup.
 *
 * Copy lives here for the same reason the landing page's does in
 * `landing.ts`: the three documents are one voice and one structure, and a
 * clause that has to be true of the running system is easier to keep honest
 * when it sits next to the constant it quotes. Every figure below is either
 * imported from `brand.ts` or carries a comment naming the code that makes it
 * true -- a legal page that drifts from the implementation is worse than no
 * page, because it is a written promise about behaviour that changed.
 *
 * `src/__tests__/legal.test.ts` asserts the clauses that the NDPA and the
 * infrastructure guidelines require, so deleting one fails the suite.
 */

/**
 * The grace period after a failed renewal, in days.
 *
 * The authoritative value is `grace_days` on the plan row -- migration 013
 * seeds every plan at 7 -- so this mirrors the seed rather than owning it. If
 * a plan is ever given a different grace period, this sentence has to become
 * per-plan rather than a single figure.
 */
const GRACE_DAYS = 7;

/** A paragraph, a plain list, or a term-and-detail list. */
export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "pairs"; rows: { term: string; detail: string }[] };

export type LegalSection = {
  /** Anchor, so a clause can be cited in an email or a support reply. */
  id: string;
  heading: string;
  blocks: LegalBlock[];
};

export type LegalSlug = "terms" | "privacy" | "acceptable-use";

export type LegalDocument = {
  slug: LegalSlug;
  title: string;
  /** One sentence under the title, in plain words. */
  standfirst: string;
  effective: string;
  sections: LegalSection[];
};

/** Footer and cross-reference links. Order is the order they appear. */
export const LEGAL_PAGES: { slug: LegalSlug; href: string; label: string }[] = [
  { slug: "terms", href: "/terms", label: "Terms" },
  { slug: "privacy", href: "/privacy", label: "Privacy" },
  { slug: "acceptable-use", href: "/acceptable-use", label: "Acceptable use" },
];

export const TERMS: LegalDocument = {
  slug: "terms",
  title: "Terms of service",
  standfirst: `The agreement between you and ${COMPANY_NAME} for ${PRODUCT_NAME}. Plain words where plain words will do.`,
  effective: LEGAL_EFFECTIVE,
  sections: [
    {
      id: "who-we-are",
      heading: "Who you are agreeing with",
      blocks: [
        {
          kind: "p",
          text: `${PRODUCT_NAME} is a dynamic QR code service operated by ${COMPANY_NAME}. These terms govern your use of it. Creating an account means you accept them, and accept the acceptable use policy and privacy policy, which form part of this agreement.`,
        },
        {
          kind: "p",
          text: `If you are agreeing on behalf of a business, you confirm you are allowed to commit that business. "You" below means that business.`,
        },
      ],
    },
    {
      id: "the-service",
      heading: "What the service does",
      blocks: [
        {
          kind: "p",
          text: `We issue you a short code on ${CODE_HOST}. You print the symbol for that code on whatever you like, and you change where it leads whenever you need to, as often as you need to, without reprinting.`,
        },
        {
          kind: "p",
          text: `The address encoded in the symbol never changes: it is ${CODE_LENGTH} characters on ${CODE_HOST} and we do not move the host, shorten the code or re-issue a code that has been printed. A code you stop paying for is paused, never given to someone else.`,
        },
        {
          kind: "p",
          text: `We record each scan so you can see how your printed material is performing. What we record, and what we deliberately do not, is set out in the privacy policy.`,
        },
      ],
    },
    {
      id: "your-account",
      heading: "Your account",
      blocks: [
        {
          kind: "list",
          items: [
            "Give us accurate details and keep them current. We use your email for everything that matters, including notice that a payment failed or a code has been blocked.",
            "Confirm your email address. Until you do, some features stay closed.",
            "Keep your password to yourself. You are responsible for what happens under your account, so tell us immediately if you think someone else has access.",
            "One account per business. Opening a second account to get around a limit, a suspension or a plan ceiling is a breach of these terms.",
          ],
        },
      ],
    },
    {
      id: "plans-and-payment",
      heading: "Plans and payment",
      blocks: [
        {
          kind: "p",
          text: `Plans are billed in naira through Paystack, monthly or annually, and charged in advance. A subscription renews automatically on the same cycle until you cancel it.`,
        },
        {
          kind: "p",
          text: `Paystack handles the payment and holds your card details; we never see or store them. We treat Paystack's confirmation as the only evidence that a payment happened, which is why activation can take a moment longer than the browser returning from checkout.`,
        },
        {
          kind: "p",
          text: `Each plan sets how many codes you may have live and how long your scan history is kept. Your plan page shows both. Prices are inclusive of any tax we are required to charge; bank or card charges your own bank adds are yours.`,
        },
      ],
    },
    {
      id: "cancelling",
      heading: "Cancelling, and refunds",
      blocks: [
        {
          kind: "p",
          text: `You can cancel at any time from your plan page. Cancelling stops the next renewal: your codes keep working for the rest of the period you have already paid for, and pause when it ends.`,
        },
        {
          kind: "p",
          text: `Payments are not refundable, including for a period you only partly used. Because cancelling always runs to the end of the paid period, you never pay for time you cannot use.`,
        },
        {
          kind: "p",
          text: `Pausing is not deletion. Your codes, their destinations and their scan history stay as they are, and paying again brings them straight back. Anyone scanning a paused code meets a calm page carrying your business's name, not an error.`,
        },
      ],
    },
    {
      id: "failed-payments",
      heading: "When a payment fails",
      blocks: [
        {
          kind: "p",
          // graceDays in qr_plans, seeded at 7 by migration 013; the lapse cron
          // at /api/cron/grace is what enforces the end of it.
          text: `A failed renewal does not stop your codes that day. We email you and your codes keep working for a grace period of ${GRACE_DAYS} days while you sort the payment out. If the grace period ends unpaid, your codes pause and scans meet the paused page. A successful payment restores them.`,
        },
      ],
    },
    {
      id: "your-destinations",
      heading: "The links you point codes at",
      blocks: [
        {
          kind: "p",
          text: `The destination behind a code is yours. You are responsible for it, you confirm you have the right to link to it, and you confirm it is lawful.`,
        },
        {
          kind: "p",
          text: `We screen destinations when you set them and we re-check them afterwards. We refuse links that cannot be screened honestly — other URL shorteners, redirect chains, and anything that is not an ordinary https:// or http:// web address — and we may refuse or block a destination we believe breaches the acceptable use policy.`,
        },
        {
          kind: "p",
          text: `Screening is a safety net, not an endorsement. That a link was accepted does not mean we have reviewed, approved or vouched for it.`,
        },
      ],
    },
    {
      id: "acceptable-use",
      heading: "Acceptable use",
      blocks: [
        {
          kind: "p",
          text: `The acceptable use policy lists what a code must never point at and what you must never do with the platform. It is part of these terms, and breaching it is the main reason an account or a code is stopped.`,
        },
      ],
    },
    {
      id: "suspension",
      heading: "Blocking a code, suspending an account",
      blocks: [
        {
          kind: "p",
          text: `We may block an individual code or suspend an account where we reasonably believe the acceptable use policy has been breached, where payment is overdue beyond the grace period, where we are required to by law or a competent authority, or where an account is being used to harm the people scanning its codes.`,
        },
        {
          kind: "p",
          text: `We block the narrowest thing that solves the problem: one code before an account, and a suspension before anything permanent. We tell you by email, a blocked code shows a page carrying its reference, and you can ask us to look again by writing to ${SUPPORT_EMAIL}.`,
        },
        {
          kind: "p",
          text: `Accounts are suspended and codes are paused. Neither is deleted to settle a dispute, because deleting one would dead-end printed material that is already in people's hands.`,
        },
      ],
    },
    {
      id: "availability",
      heading: "Availability",
      blocks: [
        {
          kind: "p",
          text: `The redirect is built to be the most reliable thing we run, and every design decision in the platform gives way to it. We still do not promise uninterrupted service, and we do not offer a service level agreement.`,
        },
        {
          kind: "p",
          text: `We are not responsible for failures outside our control: your destination site being down, a network or hosting outage upstream, or a scanner app behaving oddly. Where a scan cannot be served normally, we serve a page that tells the person what is happening rather than letting the browser report an error.`,
        },
      ],
    },
    {
      id: "data-roles",
      heading: "Data protection roles",
      blocks: [
        {
          kind: "p",
          // The NDPA split required by INFRASTRUCTURE.md. Stated in both
          // documents on purpose; legal.test.ts asserts both say it.
          text: `Under the Nigeria Data Protection Act 2023 we hold two different roles, and the difference decides who answers for what.`,
        },
        {
          kind: "pairs",
          rows: [
            {
              term: `Your account: we are the data controller`,
              detail: `Your name, your email address and your billing record are ours to look after. We decide why they are held, and we answer to you for them.`,
            },
            {
              term: `Your scan data: we are a data processor`,
              detail: `Scan records are collected on your behalf, for you. You are the controller; we process them only to provide the service and only as these terms and the privacy policy describe. We do not sell them, share them with other customers or use them to build profiles.`,
            },
          ],
        },
        {
          kind: "p",
          text: `As your processor we keep scan data minimal by design — a salted daily hash instead of your scanners' IP addresses, country and city instead of a location, and no cookies set on the redirect. We use only the sub-processors listed in the privacy policy, we will help you answer a data subject request, and we delete scan data on the schedule set out there.`,
        },
        {
          kind: "p",
          text: `What sits behind your code is a separate matter. If your destination collects personal data, you are the controller of that, and telling the people scanning what happens to it is your responsibility, not ours.`,
        },
      ],
    },
    {
      id: "intellectual-property",
      heading: "Who owns what",
      blocks: [
        {
          kind: "p",
          text: `${PRODUCT_NAME}, ${COMPANY_NAME}, the wordmark and the platform itself stay ours. Your codes, your destinations, your artwork and your scan data stay yours; you give us only the permission we need to serve them, which ends when you close your account.`,
        },
        {
          kind: "p",
          text: `The QR symbol we generate for your code is yours to print, reproduce and modify, including on commercial packaging, with no further permission needed.`,
        },
      ],
    },
    {
      id: "liability",
      heading: "Liability",
      blocks: [
        {
          kind: "p",
          text: `The service is provided as it is. To the extent the law allows, we exclude implied warranties, and our total liability to you for any claim is limited to the fees you paid us in the twelve months before it arose.`,
        },
        {
          kind: "p",
          text: `We are not liable for indirect or consequential loss, and that specifically includes the cost of reprinting material. This is the one exclusion worth reading twice, so here is the honest version of it: the whole platform is built around not making you reprint, we hold reliability above every feature for that reason, and we still cannot underwrite your print run.`,
        },
        {
          kind: "p",
          text: `Nothing here limits liability that cannot be limited by law, including for death, personal injury or fraud.`,
        },
      ],
    },
    {
      id: "ending",
      heading: "Ending the agreement",
      blocks: [
        {
          kind: "p",
          text: `You can close your account by writing to ${SUPPORT_EMAIL}. We can end this agreement by giving you reasonable notice, or immediately where the acceptable use policy has been seriously breached.`,
        },
        {
          kind: "p",
          text: `When an account closes or lapses, your codes and their data are kept for ${LAPSE_RETENTION_MONTHS} months and then deleted. Within that window everything can be restored. We keep it that long because printed material outlives a missed payment, and no longer because holding personal data without a reason is not ours to do.`,
        },
      ],
    },
    {
      id: "changes",
      heading: "Changes to these terms",
      blocks: [
        {
          kind: "p",
          text: `We may change these terms. For a change that materially affects you we will email you at least 14 days before it takes effect, and continuing to use the service after that date means you accept it. If you do not, cancel before it applies. Ask us for an earlier version at any time and we will send it.`,
        },
      ],
    },
    {
      id: "law",
      heading: "Law, and disagreements",
      blocks: [
        {
          kind: "p",
          text: `This agreement is governed by the laws of the Federal Republic of Nigeria, and the Nigerian courts have jurisdiction.`,
        },
        {
          kind: "p",
          text: `Before anything formal, write to ${SUPPORT_EMAIL}. Most problems are a misunderstanding about a code or a payment and are settled in a day. A complaint about how we handle personal data can also go to the Nigeria Data Protection Commission.`,
        },
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  slug: "privacy",
  title: "Privacy policy",
  standfirst: `What ${PRODUCT_NAME} records, what it deliberately does not, and what you can ask us to do about it.`,
  effective: LEGAL_EFFECTIVE,
  sections: [
    {
      id: "short-version",
      heading: "The short version",
      blocks: [
        {
          kind: "list",
          items: [
            "We never store the IP address of anyone who scans a code. We store a hash that is salted and rotated daily, so a scanner cannot be followed from one day to the next — not by us, not by you, not by anyone who obtained the data.",
            "The redirect sets no cookies. Nothing is dropped on the phone of someone scanning your code.",
            "Scan records hold country, city, device type, operating system and browser. Never a name, never an address, never an advertising identifier.",
            "We never see your card details. Paystack handles payment.",
            "We do not sell data, and we do not use one customer's scan data for anything but that customer.",
          ],
        },
      ],
    },
    {
      id: "two-roles",
      heading: "Our two roles",
      blocks: [
        {
          kind: "p",
          text: `Under the Nigeria Data Protection Act 2023, ${COMPANY_NAME} is the data controller for ${PRODUCT_NAME} account data — your name, your email, your billing record — and a data processor for the scan data we collect on our customers' behalf.`,
        },
        {
          kind: "p",
          text: `So if you are a customer, this page tells you what we hold about you and what we do with it. If you are a customer's customer, who scanned a code on a label or a poster, the section on scan data is the one that concerns you.`,
        },
      ],
    },
    {
      id: "account-data",
      heading: "Account data",
      blocks: [
        {
          kind: "pairs",
          rows: [
            {
              term: "What we hold",
              detail: `Your business or contact name, your email address, whether that address has been confirmed, and a one-way hash of your password. We never hold the password itself.`,
            },
            {
              term: "Why",
              detail: `To give you an account, to let you sign in, and to reach you about things that affect your printed codes: a failed payment, a blocked code, the end of a grace period.`,
            },
            {
              term: "On what basis",
              detail: `To perform our contract with you, and to meet legal obligations such as keeping billing records.`,
            },
          ],
        },
        {
          kind: "p",
          text: `Accounts are handled by Neon's managed authentication service, which stores the account record and the password hash. Your profile row in our own database holds only your name and email.`,
        },
      ],
    },
    {
      id: "code-data",
      heading: "Your codes",
      blocks: [
        {
          kind: "p",
          text: `For each code: its short code, the label you gave it, its current destination, when it was created and changed, and whether it is live, paused or blocked. Destinations are web addresses, which can themselves contain personal data if you put it there — a tracking parameter with a customer's name, for instance. Try not to.`,
        },
      ],
    },
    {
      id: "scan-data",
      heading: "Scan data",
      blocks: [
        {
          kind: "p",
          text: `When someone scans a code, we record one row: the code scanned, the time, the country and city, the device type, the operating system, the browser, whether we believe the request came from a bot or a link preview, and a hashed visitor value.`,
        },
        {
          kind: "p",
          // Enforced in src/lib/ip.ts: sha256(ip + salt + UTC day).
          text: `That hashed value is the one part worth explaining. It is a SHA-256 hash of the scanner's IP address combined with a secret salt and the date. The raw address is never written to the database and never written to a log. Because the date is part of the hash, the same phone scanning the same code on two days produces two unrelated values: unique counts work within a day, and tracking across days is not possible even for us.`,
        },
        {
          kind: "p",
          text: `Country and city come from the hosting network's own geographic header. We run no IP geolocation database, and when that header is absent the field is simply empty.`,
        },
        {
          kind: "p",
          text: `The redirect sets no cookies, runs no analytics script and loads nothing in the scanner's browser. It answers with a redirect and nothing else.`,
        },
        {
          kind: "p",
          text: `Where a very high volume of requests arrives from one address, we stop recording those scans — but still serve the redirect. The printed code working matters more than the count being complete.`,
        },
      ],
    },
    {
      id: "payment-data",
      heading: "Payment data",
      blocks: [
        {
          kind: "p",
          text: `Payments run through Paystack. Your card details go to Paystack and never to us: we hold the transaction reference, the plan, the amount, the status and the period it covers. Paystack's own privacy terms govern what they hold.`,
        },
      ],
    },
    {
      id: "cookies",
      heading: "Cookies",
      blocks: [
        {
          kind: "p",
          text: `One cookie, and only when you sign in: the session cookie that keeps you signed in to your dashboard. It is strictly necessary, so it needs no consent banner, and signing out clears it.`,
        },
        {
          kind: "p",
          text: `There are no advertising cookies, no analytics cookies and no third-party trackers anywhere on this site — including on the redirect and on the status pages a scanner might land on.`,
        },
      ],
    },
    {
      id: "email",
      heading: "Email we send you",
      blocks: [
        {
          kind: "p",
          text: `Transactional messages only: confirming your address, resetting your password, receipts, a failed payment, a grace period ending, a code blocked. They are sent through Resend, which processes your address to deliver them. We do not send marketing email without asking you first.`,
        },
      ],
    },
    {
      id: "processors",
      heading: "Who else processes this data",
      blocks: [
        {
          kind: "p",
          text: `A short list, kept short on purpose. Each is bound by contract to process data only on our instructions.`,
        },
        {
          kind: "pairs",
          rows: [
            {
              term: "Neon",
              detail: `The database, the managed authentication service that holds account records, and object storage for generated artwork.`,
            },
            {
              term: "Vercel",
              detail: `Hosting and the redirect itself, including the geographic header that gives us a scan's country.`,
            },
            {
              term: "Upstash",
              detail: `A cache and a rate limiter. It holds destination lookups and scan counters keyed on the hashed visitor value, never anything identifying.`,
            },
            { term: "Paystack", detail: `Payments and subscriptions.` },
            { term: "Resend", detail: `Sending the transactional email above.` },
            {
              term: "A URL reputation service",
              detail: `Destination screening checks a link against a reputation service. It receives the destination address, which is a customer's own link and not a scanner's data.`,
            },
          ],
        },
      ],
    },
    {
      id: "where",
      heading: "Where the data is held",
      blocks: [
        {
          kind: "p",
          text: `Our hosting and database providers operate outside Nigeria, so account and scan data is processed abroad. Where the NDPA requires safeguards for that, they come from our contracts with each provider. If you need to know the specific regions for a procurement review, ask and we will tell you.`,
        },
      ],
    },
    {
      id: "retention",
      heading: "How long we keep things",
      blocks: [
        {
          kind: "pairs",
          rows: [
            {
              term: "Individual scan records",
              // history_days in qr_plans: 90 / 365 / 730 as seeded by
              // migration 013. The plan page is the authoritative figure.
              detail: `For the scan history window your plan provides — between 90 days and 24 months, shown on your plan page — after which each row is deleted. Nothing is deleted before it has been counted.`,
            },
            {
              term: "Daily totals",
              detail: `Once individual records expire, only daily totals per code, country and device type remain. They carry no visitor value of any kind and are what your older charts are drawn from.`,
            },
            {
              term: "Your account and codes",
              detail: `For as long as your account is open. Pausing, lapsing and suspension all keep everything intact.`,
            },
            {
              term: "After an account closes or lapses",
              detail: `${LAPSE_RETENTION_MONTHS} months, then deleted. Printed material outlives a missed payment, so a late return restores everything; past that there is no reason for us to hold it.`,
            },
            {
              term: "Abuse reports",
              detail: `Up to 24 months, so a pattern of abuse across accounts can be recognised.`,
            },
            {
              term: "Billing records",
              detail: `As long as tax and company law require us to keep them, which is longer than the rest.`,
            },
          ],
        },
      ],
    },
    {
      id: "your-rights",
      heading: "Your rights",
      blocks: [
        {
          kind: "p",
          text: `If you are a customer, you can ask us to show you what we hold, correct it, delete it, or hand it to you in a portable form. You can object to a particular use, and you can withdraw consent where consent is what we relied on.`,
        },
        {
          kind: "p",
          text: `Some of this you can do yourself: your settings page shows your account data, and scan history for a code can be exported as CSV where your plan includes it. The export deliberately leaves out the hashed visitor value — it is not an address, but handing out a per-day identifier for your customers is more than anyone needs.`,
        },
        {
          kind: "p",
          text: `For anything else, write to ${SUPPORT_EMAIL} and we will answer within 30 days. If we have got it wrong, you can complain to the Nigeria Data Protection Commission.`,
        },
      ],
    },
    {
      id: "scanners",
      heading: "If you scanned a code",
      blocks: [
        {
          kind: "p",
          text: `We hold no name, no email address, no phone number and no raw IP address for you, and the hashed value we do hold is rotated daily and cannot be reversed. In practice there is nothing we can retrieve, correct or delete on request, because there is nothing we can connect to you.`,
        },
        {
          kind: "p",
          text: `Whatever the code led you to is a different matter. That site belongs to the business that printed the code, and its own privacy notice governs it. If a code has led you somewhere harmful, use the "Report this link" form on any of our status pages, or write to ${SUPPORT_EMAIL}.`,
        },
      ],
    },
    {
      id: "children",
      heading: "Children",
      blocks: [
        {
          kind: "p",
          text: `The service is for businesses, and accounts are not for anyone under 18. We do not knowingly collect data about children, and we do not ask the age of anyone scanning a code.`,
        },
      ],
    },
    {
      id: "changes-contact",
      heading: "Changes, and how to reach us",
      blocks: [
        {
          kind: "p",
          text: `If we change this policy in a way that materially affects you, we will email you before it takes effect. The date at the top always shows the current version.`,
        },
        {
          kind: "p",
          text: `Questions, requests and complaints about personal data: ${SUPPORT_EMAIL}.`,
        },
      ],
    },
  ],
};

export const ACCEPTABLE_USE: LegalDocument = {
  slug: "acceptable-use",
  title: "Acceptable use",
  standfirst: `What a code must never point at, what you must never do with the platform, and what happens when someone does it anyway.`,
  effective: LEGAL_EFFECTIVE,
  sections: [
    {
      id: "the-rule",
      heading: "The rule behind all of this",
      blocks: [
        {
          kind: "p",
          text: `Someone scanning a code is trusting the printed thing in front of them, and they have no way to see where it leads before they go there. Everything below follows from not betraying that.`,
        },
      ],
    },
    {
      id: "destinations",
      heading: "Never point a code at",
      blocks: [
        {
          kind: "list",
          items: [
            "Phishing of any kind: a page imitating a bank, a payment provider, a government service, an employer or us, or any page harvesting passwords, card details, BVNs or one-time codes.",
            "Malware, spyware, or anything that downloads or installs without the person asking.",
            "Fraud: fake shops, advance-fee schemes, fake investment or cryptocurrency offers, fake charity appeals, counterfeit goods.",
            "Impersonation of a person, a business, a bank, a regulator or a public authority — including any suggestion that a code is officially from us or from De Sign Plus when it is not.",
            "Content that is illegal under Nigerian law.",
            "Child sexual abuse material. This one has no warning, no appeal and no second account: we close the account and report it to the authorities.",
            "Content inciting violence, terrorism or hatred against people for who they are.",
            "Intimate images shared without the consent of the person in them.",
            "Unlicensed pharmaceuticals, controlled drugs, weapons, or anything else requiring a licence you do not hold.",
            "Gambling without the licence your jurisdiction requires.",
            "Destinations whose business is unsolicited bulk messaging.",
            "Another URL shortener, or a redirect chain. The point of a code is that we can see where it goes.",
            "Anything that is not an ordinary https:// or http:// web address. A code may not auto-dial, auto-download or hand off to an app-only scheme.",
          ],
        },
      ],
    },
    {
      id: "platform",
      heading: "Never do this with the platform",
      blocks: [
        {
          kind: "list",
          items: [
            "Inflate your own scan counts, or anyone else's, with scripted or automated scanning.",
            "Open a new account to get around a block, a suspension or a plan limit.",
            "Resell codes as a way for other people to hide where their links go.",
            "Probe, scan or attempt to break our infrastructure, or circumvent rate limits, authentication or screening.",
            "Create codes in bulk for onward distribution without agreeing it with us first.",
            "Use codes to follow or identify particular individuals. The data is deliberately built so you cannot, and trying is a breach whether it works or not.",
          ],
        },
      ],
    },
    {
      id: "bait-and-switch",
      heading: "Changing the destination after printing",
      blocks: [
        {
          kind: "p",
          text: `Re-pointing a code is the whole product, and you never need a reason. But getting a code approved with a harmless link and switching it to a banned one once the print run is out is the most serious breach in this document, because the printed material is now vouching for something nobody checked.`,
        },
        {
          kind: "p",
          text: `This is why we screen a destination every time it changes and re-check it afterwards, not only when the code is created.`,
        },
      ],
    },
    {
      id: "enforcement",
      heading: "How we enforce this",
      blocks: [
        {
          kind: "p",
          text: `We take the smallest step that stops the harm, in this order.`,
        },
        {
          kind: "pairs",
          rows: [
            {
              term: "We email you",
              detail: `For something that looks like a mistake or a borderline link, we ask you to change it, with a deadline.`,
            },
            {
              term: "We block the code",
              detail: `For a clear breach, immediately and without warning. Scans meet a page explaining the link has been disabled and carrying its reference.`,
            },
            {
              term: "We suspend the account",
              detail: `Where the problem is the account rather than one code. Codes stop serving; nothing is deleted.`,
            },
            {
              term: "We close the account",
              detail: `For severe or repeated breaches. Data is then kept and deleted on the schedule in the privacy policy.`,
            },
          ],
        },
        {
          kind: "p",
          text: `Throughout, codes are paused and accounts are suspended rather than deleted. That is deliberate: it means a decision we got wrong can be undone completely.`,
        },
      ],
    },
    {
      id: "reporting",
      heading: "Reporting a code",
      blocks: [
        {
          kind: "p",
          text: `Every status page on this host carries a "Report this link" form, and anyone can use it — you do not need an account. Tell us the code reference and what you saw.`,
        },
        {
          kind: "p",
          text: `We look at reports within one business day. Child sexual abuse material, a credible threat to someone's safety, and active phishing are acted on as soon as we see them, and referred to the authorities where that is right. You can also write to ${SUPPORT_EMAIL}.`,
        },
      ],
    },
    {
      id: "appeals",
      heading: "If we have blocked something of yours",
      blocks: [
        {
          kind: "p",
          text: `Write to ${SUPPORT_EMAIL} with the code reference. A person reads it, and we tell you what we found and what would resolve it. Automated screening is capable of being wrong, and a false positive on a code that is already printed is exactly the kind of thing we want to hear about quickly.`,
        },
      ],
    },
    {
      id: "not-our-business",
      heading: "What we do not police",
      blocks: [
        {
          kind: "p",
          text: `Lawful content we happen to disagree with, competitors' links, and your commercial decisions are none of our business. This policy is about harm and legality, not taste.`,
        },
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: Record<LegalSlug, LegalDocument> = {
  terms: TERMS,
  privacy: PRIVACY,
  "acceptable-use": ACCEPTABLE_USE,
};
