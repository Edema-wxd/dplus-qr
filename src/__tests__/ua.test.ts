import { isBotAgent, parseAgent } from "@/lib/ua";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 9; SM-J600F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Mobile Safari/537.36";
const WHATSAPP = "WhatsApp/2.23.20.0 A";

describe("isBotAgent", () => {
  it("treats a real iPhone scan as a person", () => {
    expect(isBotAgent(IPHONE)).toBe(false);
  });

  it("treats an older Android scan as a person", () => {
    expect(isBotAgent(ANDROID)).toBe(false);
  });

  it.each([
    ["WhatsApp link preview", WHATSAPP],
    ["Facebook unfurl", "facebookexternalhit/1.1"],
    ["Slackbot", "Slackbot-LinkExpanding 1.0"],
    ["Telegram", "TelegramBot (like TwitterBot)"],
    ["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1)"],
    ["curl", "curl/8.4.0"],
    ["uptime monitor", "Better Uptime Bot"],
  ])("flags %s as a bot", (_label, ua) => {
    expect(isBotAgent(ua)).toBe(true);
  });

  it("treats a missing user agent as a bot, since no camera omits one", () => {
    expect(isBotAgent(null)).toBe(true);
  });
});

describe("parseAgent", () => {
  it("identifies an iPhone", () => {
    const parsed = parseAgent(IPHONE);
    expect(parsed.isBot).toBe(false);
    expect(parsed.os).toBe("iOS");
    expect(parsed.deviceType).toBe("mobile");
  });

  it("identifies an Android phone", () => {
    const parsed = parseAgent(ANDROID);
    expect(parsed.isBot).toBe(false);
    expect(parsed.os).toBe("Android");
    expect(parsed.deviceType).toBe("mobile");
  });

  it("marks a WhatsApp preview as a bot so it is excluded from client counts", () => {
    expect(parseAgent(WHATSAPP).isBot).toBe(true);
  });

  it("does not throw on a nonsense user agent", () => {
    expect(() => parseAgent("!!!!")).not.toThrow();
  });
});
