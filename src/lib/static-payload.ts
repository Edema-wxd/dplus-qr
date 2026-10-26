import { screenUrl } from "@/lib/screening";

/**
 * What a static code encodes.
 *
 * A static code carries its content in the symbol itself. There is no short
 * code, no row, no redirect and no scan history -- and nothing here is ever
 * on the redirect path. These are pure functions so the browser can build the
 * payload and the tests can pin the formats without a database.
 */

export const STATIC_KINDS = ["url", "text", "email", "phone", "sms", "wifi"] as const;
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
      const number = f("phone").replace(/[\s().-]/g, "");
      if (!/^\+?\d{5,15}$/.test(number)) {
        return fail("Enter a phone number, with country code if you can: +234…");
      }
      content = `tel:${number}`;
      break;
    }
    case "sms": {
      const number = f("phone").replace(/[\s().-]/g, "");
      if (!/^\+?\d{5,15}$/.test(number)) {
        return fail("Enter a phone number, with country code if you can: +234…");
      }
      const message = fields.message?.trim();
      content = `SMSTO:${number}:${message ?? ""}`;
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
