import {
  ACCEPTABLE_USE,
  LEGAL_DOCUMENTS,
  LEGAL_PAGES,
  PRIVACY,
  TERMS,
  type LegalDocument,
} from "@/lib/legal";
import { INBOX_DOMAIN, LAPSE_RETENTION_MONTHS } from "@/lib/brand";
import { ALPHABET, CODE_LENGTH, isReserved } from "@/lib/short-code";

/** Every word of a document, flattened, for clause assertions. */
function text(doc: LegalDocument): string {
  return doc.sections
    .flatMap((section) => [
      section.heading,
      ...section.blocks.flatMap((block) => {
        if (block.kind === "p") return [block.text];
        if (block.kind === "list") return block.items;
        return block.rows.flatMap((row) => [row.term, row.detail]);
      }),
    ])
    .join("\n");
}

const DOCS = Object.values(LEGAL_DOCUMENTS);

describe("legal pages", () => {
  it("covers each document exactly once in the footer links", () => {
    expect(LEGAL_PAGES.map((page) => page.slug).sort()).toEqual(
      Object.keys(LEGAL_DOCUMENTS).sort()
    );
  });

  /**
   * The reason RESERVED_CODES exists. A route name issued as a short code
   * would be shadowed by the page and dead-end whatever it was printed on, so
   * every legal route has to be unreachable as a generated code -- either
   * reserved, or impossible to generate because of its length or characters.
   */
  it("can never be issued as a short code", () => {
    for (const page of LEGAL_PAGES) {
      const name = page.href.replace(/^\//, "");
      const generatable =
        name.length === CODE_LENGTH &&
        [...name].every((character) => ALPHABET.includes(character));

      expect(isReserved(name) || !generatable).toBe(true);
    }
  });

  it("gives every section a unique anchor", () => {
    for (const doc of DOCS) {
      const ids = doc.sections.map((section) => section.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("leaves no section empty and no placeholder behind", () => {
    for (const doc of DOCS) {
      expect(doc.sections.length).toBeGreaterThan(0);
      for (const section of doc.sections) {
        expect(section.blocks.length).toBeGreaterThan(0);
      }
      expect(text(doc)).not.toMatch(/TODO|TBD|lorem ipsum|XXX/i);
      // The repo writes "--" in comments and an em dash in copy. These
      // strings are copy, and a stray "--" renders literally on the page.
      expect(text(doc)).not.toContain(" -- ");
    }
  });

  /**
   * SENDING_DOMAIN publishes no MX, so an address there is rejected and the
   * sender is never told. A legal page is the worst place to print one: it is
   * where someone goes to exercise a data right or appeal a block, and the
   * message would vanish. Same rule as email-groups.test.ts, applied to copy.
   */
  it("never invites mail to the send-only domain", () => {
    for (const doc of DOCS) {
      // Deliberately refuses a trailing full stop, so a sentence-final
      // address is not read as part of the domain.
      const addresses =
        text(doc).match(/[\w.+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi) ?? [];
      expect(addresses.length).toBeGreaterThan(0);
      for (const address of addresses) {
        expect(address.endsWith(`@${INBOX_DOMAIN}`)).toBe(true);
      }
    }
  });

  /**
   * The NDPA split from INFRASTRUCTURE.md: controller for account data,
   * processor for scan data. Both roles must be stated in both documents --
   * which of the two we are decides who answers for a given record, so a
   * document that names only one is misleading rather than merely incomplete.
   */
  it("states both data protection roles in the terms and the privacy policy", () => {
    for (const doc of [TERMS, PRIVACY]) {
      const body = text(doc);
      expect(body).toMatch(/Nigeria Data Protection Act 2023/);
      expect(body).toMatch(/data controller/i);
      expect(body).toMatch(/data processor|a processor/i);
    }
  });

  it("states the refund position and that a subscription renews itself", () => {
    const body = text(TERMS);
    expect(body).toMatch(/not refundable/i);
    expect(body).toMatch(/renews automatically/i);
    expect(body).toMatch(/rest of the period you have already paid for/i);
  });

  /** The retention limit is a promise, so the copy must track the constant. */
  it("quotes the retention window from the constant that sets it", () => {
    expect(text(TERMS)).toContain(`${LAPSE_RETENTION_MONTHS} months`);
    expect(text(PRIVACY)).toContain(`${LAPSE_RETENTION_MONTHS} months`);
  });

  /**
   * The privacy promises that are enforced in code rather than by convention:
   * `hashIp()` in src/lib/ip.ts salts with the UTC day, and the redirect sets
   * no cookies. If either changes, this page has to change with it.
   */
  it("keeps the privacy claims the redirect path actually honours", () => {
    const body = text(PRIVACY);
    expect(body).toMatch(/never store the IP address/i);
    expect(body).toMatch(/SHA-256/);
    expect(body).toMatch(/salt/i);
    expect(body).toMatch(/redirect sets no cookies/i);
    expect(body).toMatch(/Paystack/);
  });

  it("names the rights a data subject can exercise, and how", () => {
    const body = text(PRIVACY);
    for (const right of [/correct it/i, /delete it/i, /portable/i, /object/i]) {
      expect(body).toMatch(right);
    }
    expect(body).toMatch(/Nigeria Data Protection Commission/);
  });

  /** The bans INFRASTRUCTURE.md requires the acceptable-use clause to carry. */
  it("bans phishing, fraud and illegal content explicitly", () => {
    const body = text(ACCEPTABLE_USE);
    expect(body).toMatch(/phishing/i);
    expect(body).toMatch(/fraud/i);
    expect(body).toMatch(/illegal under Nigerian law/i);
    expect(body).toMatch(/shortener/i);
  });

  it("explains enforcement and how to appeal it", () => {
    const body = text(ACCEPTABLE_USE);
    expect(body).toMatch(/suspend/i);
    expect(body).toMatch(/block/i);
    expect(body).toMatch(/nothing is deleted|rather than deleted/i);
    expect(body).toMatch(/Report this link/);
  });
});
