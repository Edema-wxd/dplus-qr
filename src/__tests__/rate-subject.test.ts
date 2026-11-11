import { rateSubject } from "@/lib/ip";
import { memoryAllow } from "@/lib/ratelimit";

describe("rateSubject (audit L8)", () => {
  it("keeps an IPv4 address whole", () => {
    expect(rateSubject("203.0.113.7")).toBe("203.0.113.7");
  });

  it("keys an IPv6 address on its /64", () => {
    expect(rateSubject("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8:85a3:8d3::/64");
  });

  it("gives every address in one /64 the same key", () => {
    const a = rateSubject("2001:db8:1:2::1");
    expect(rateSubject("2001:db8:1:2:ffff:ffff:ffff:fffe")).toBe(a);
    expect(rateSubject("2001:0DB8:0001:0002:0:0:0:9")).toBe(a);
    expect(rateSubject("[2001:db8:1:2::abcd]")).toBe(a);
    expect(rateSubject("2001:db8:1:3::1")).not.toBe(a);
  });

  it("expands :: wherever it falls", () => {
    expect(rateSubject("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(rateSubject("::1")).toBe("0:0:0:0::/64");
    expect(rateSubject("fe80::1%en0")).toBe("fe80:0:0:0::/64");
  });

  it("reads an IPv4-mapped address as IPv4", () => {
    expect(rateSubject("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });
});

describe("memoryAllow", () => {
  it("allows up to the limit in a window, then refuses", () => {
    const t = 1_000_000;
    const results = Array.from({ length: 4 }, (_, i) => memoryAllow("t1", "k", 3, 1000, t + i));
    expect(results).toEqual([true, true, true, false]);
  });

  it("allows again once the window has passed", () => {
    const t = 2_000_000;
    for (let i = 0; i < 3; i++) memoryAllow("t2", "k", 3, 1000, t);
    expect(memoryAllow("t2", "k", 3, 1000, t + 500)).toBe(false);
    expect(memoryAllow("t2", "k", 3, 1000, t + 1001)).toBe(true);
  });

  it("counts keys and limiters apart", () => {
    const t = 3_000_000;
    expect(memoryAllow("t3", "a", 1, 1000, t)).toBe(true);
    expect(memoryAllow("t3", "a", 1, 1000, t)).toBe(false);
    expect(memoryAllow("t3", "b", 1, 1000, t)).toBe(true);
    expect(memoryAllow("t4", "a", 1, 1000, t)).toBe(true);
  });
});
