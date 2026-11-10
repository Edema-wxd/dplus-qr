import { screenUrl } from "@/lib/screening";
import { buildVCard } from "@/lib/vcard";
import { checkBitcoinAddress } from "@/lib/bitcoin-address";

/**
 * What a static code encodes.
 *
 * A static code carries its content in the symbol itself. There is no short
 * code, no row, no redirect and no scan history -- and nothing here is ever
 * on the redirect path. These are pure functions so the browser can build the
 * payload and the tests can pin the formats without a database.
 */

export const STATIC_KINDS = [
  "url",
  "text",
  "email",
  "phone",
  "sms",
  "whatsapp",
  "wifi",
  "vcard",
  "paypal",
  "bitcoin",
] as const;
export type StaticKind = (typeof STATIC_KINDS)[number];

export type StaticFields = Record<string, string>;

export type PayloadResult =
  | { ok: true; content: string }
  | { ok: false; reason: string };

const MAX_CONTENT = 1000;

/** Wi-Fi payloads reserve these characters; each must be backslash-escaped. */
function escapeWifi(value: string): string {
  return value.replace(/([\;,:"])/g, "\\$1");
}

function fail(reason: string): PayloadResult {
  return { ok: false, reason };
}

/** Digits with an optional leading plus, formatting stripped. */
function phoneDigits(raw: string): string | null {
  const number = raw.replace(/[\s().-]/g, "");
  return /^\+?\d{5,15}$/.test(number) ? number : null;
}

const PHONE_REASON = "Enter a phone number, with country code if you can: +234…";

/** Currencies PayPal accepts that a Nigerian business is likely to bill in. */
export const PAYPAL_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;

/**
 * Re-exported from `bitcoin-address.ts`, which verifies the checksum as well
 * as the shape: a printed static code cannot be corrected, so one wrong
 * character must be caught here rather than by the person paying.
 */
export { isBitcoinAddress } from "@/lib/bitcoin-address";

export function buildStaticPayload(
  kind: StaticKind,
  fields: StaticFields
): PayloadResult {
  const f = (name: string) => (fields[name] ?? "").trim();
  let content: string;

  switch (kind) {
    case "url": {
      const screened = screenUrl(f("url"));
      if (!screened.ok) return fail(screened.reason);
      content = screened.normalised;
      break;
    }
    case "text": {
      // Not trimmed inside: line breaks are the point of a text code.
      content = (fields.text ?? "").trim();
      if (!content) return fail("Enter the text to encode.");
      break;
    }
    case "email": {
      const to = f("email");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        return fail("Enter a valid email address.");
      }
      const params = new URLSearchParams();
      if (f("subject")) params.set("subject", f("subject"));
      if (fields.body?.trim()) params.set("body", fields.body.trim());
      const qs = params.toString().replace(/\+/g, "%20");
      content = `mailto:${to}${qs ? `?${qs}` : ""}`;
      break;
    }
    case "phone": {
      const number = phoneDigits(f("phone"));
      if (!number) return fail(PHONE_REASON);
      content = `tel:${number}`;
      break;
    }
    case "sms": {
      const number = phoneDigits(f("phone"));
      if (!number) return fail(PHONE_REASON);
      const message = fields.message?.trim();
      content = `SMSTO:${number}:${message ?? ""}`;
      break;
    }
    case "whatsapp": {
      // wa.me wants the full international number with no plus and no
      // leading zeros, so a local 080... number would open the wrong chat.
      const number = phoneDigits(f("phone"));
      if (!number || !number.startsWith("+")) {
        return fail("Enter the WhatsApp number with its country code: +234…");
      }
      const message = fields.message?.trim();
      content = `https://wa.me/${number.slice(1)}${
        message ? `?text=${encodeURIComponent(message)}` : ""
      }`;
      break;
    }
    case "vcard": {
      if (!f("firstName") && !f("lastName") && !f("organisation")) {
        return fail("Enter a name or a company.");
      }
      const email = f("email");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return fail("Enter a valid email address.");
      }
      for (const name of ["mobile", "phone"]) {
        if (f(name) && !phoneDigits(f(name))) return fail(PHONE_REASON);
      }
      let website = "";
      if (f("website")) {
        const screened = screenUrl(f("website"));
        if (!screened.ok) return fail(screened.reason);
        website = screened.normalised;
      }
      content = buildVCard({
        firstName: f("firstName"),
        lastName: f("lastName"),
        organisation: f("organisation"),
        title: f("title"),
        mobile: phoneDigits(f("mobile")) ?? "",
        phone: phoneDigits(f("phone")) ?? "",
        email,
        website,
        street: f("street"),
        city: f("city"),
        region: f("region"),
        postcode: f("postcode"),
        country: f("country"),
      });
      break;
    }
    case "paypal": {
      const business = f("email");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(business)) {
        return fail("Enter the email address of the PayPal account to be paid.");
      }
      const item = f("item");
      if (!item) return fail("Say what the payment is for.");
      const amount = f("amount");
      if (amount && !/^\d{1,7}(\.\d{1,2})?$/.test(amount)) {
        return fail("Enter the amount as a number, like 25 or 25.50.");
      }
      const currency = f("currency") || "USD";
      if (!(PAYPAL_CURRENCIES as readonly string[]).includes(currency)) {
        return fail("Choose a currency.");
      }
      const params = new URLSearchParams({
        cmd: "_xclick",
        business,
        item_name: item,
        currency_code: currency,
      });
      if (amount) params.set("amount", amount);
      content = `https://www.paypal.com/cgi-bin/webscr?${params.toString()}`;
      break;
    }
    case "bitcoin": {
      const checked = checkBitcoinAddress(f("address"));
      if (!checked.ok) return fail(checked.reason);
      const address = checked.address;
      const amount = f("amount");
      if (amount && !/^\d{1,8}(\.\d{1,8})?$/.test(amount)) {
        return fail("Enter the amount in BTC, like 0.0015.");
      }
      // BIP 21. Percent-encoded by hand: URLSearchParams writes spaces as "+",
      // which BIP 21 wallets read literally.
      const params = [
        amount ? `amount=${amount}` : "",
        f("label") ? `label=${encodeURIComponent(f("label"))}` : "",
        f("message") ? `message=${encodeURIComponent(f("message"))}` : "",
      ].filter(Boolean);
      content = `bitcoin:${address}${params.length ? `?${params.join("&")}` : ""}`;
      break;
    }
    case "wifi": {
      const ssid = f("ssid");
      if (!ssid) return fail("Enter the network name.");
      const security = f("security") || "WPA";
      if (security !== "WPA" && security !== "WEP" && security !== "nopass") {
        return fail("Choose a security type.");
      }
      const password = fields.password ?? "";
      if (security !== "nopass" && !password) {
        return fail("Enter the Wi-Fi password, or choose No password.");
      }
      const hidden = fields.hidden === "true" ? "H:true;" : "";
      const pass = security === "nopass" ? "" : `P:${escapeWifi(password)};`;
      content = `WIFI:T:${security};S:${escapeWifi(ssid)};${pass}${hidden};`;
      break;
    }
  }

  if (content.length > MAX_CONTENT) {
    return fail("That is too long to scan reliably. Shorten it.");
  }
  return { ok: true, content };
}
