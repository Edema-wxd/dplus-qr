import { UAParser } from "ua-parser-js";

export type ParsedAgent = {
  deviceType: string | null;
  os: string | null;
  browser: string | null;
  isBot: boolean;
};

/**
 * Link-preview fetchers. A WhatsApp or Slack unfurl is a real request but not a
 * person scanning, so these are stored with `is_bot = true` and excluded from
 * the counts shown to clients.
 *
 * Matched as substrings of the lowercased user agent.
 */
const BOT_SIGNATURES = [
  "whatsapp",
  "facebookexternalhit",
  "facebot",
  "slackbot",
  "slack-imgproxy",
  "telegrambot",
  "twitterbot",
  "linkedinbot",
  "discordbot",
  "skypeuripreview",
  "googlebot",
  "bingbot",
  "yandexbot",
  "duckduckbot",
  "applebot",
  "pinterest",
  "redditbot",
  "embedly",
  "quora link preview",
  "vkshare",
  "w3c_validator",
  "bot",
  "crawler",
  "spider",
  "curl",
  "wget",
  "python-requests",
  "headlesschrome",
  "preview",
  "monitor",
  "uptime",
];

export function isBotAgent(userAgent: string | null): boolean {
  if (!userAgent) return true; // No UA at all is never a phone camera.
  const ua = userAgent.toLowerCase();
  return BOT_SIGNATURES.some((signature) => ua.includes(signature));
}

export function parseAgent(userAgent: string | null): ParsedAgent {
  const isBot = isBotAgent(userAgent);

  if (!userAgent) {
    return { deviceType: null, os: null, browser: null, isBot };
  }

  const parsed = UAParser(userAgent);

  return {
    // ua-parser-js leaves `device.type` undefined for desktops.
    deviceType: parsed.device.type ?? (isBot ? "bot" : "desktop"),
    os: parsed.os.name ?? null,
    browser: parsed.browser.name ?? null,
    isBot,
  };
}
