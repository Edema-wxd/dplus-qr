import { createHash, randomBytes } from "node:crypto";
import {
  base58Decode,
  bech32Decode,
  checkBitcoinAddress,
  decodeSegwitAddress,
  isBitcoinAddress,
} from "@/lib/bitcoin-address";
import { sha256 } from "@/lib/sha256";
import { buildStaticPayload } from "@/lib/static-payload";

/**
 * A static Bitcoin code is printed once, so a wrong character loses every
 * payment sent to it. These pin the checksum rules against the BIPs' own
 * published vectors, copied verbatim from bip-0173.mediawiki and
 * bip-0350.mediawiki (Appendices / Test vectors).
 */

// --- BIP 173 and BIP 350 test vectors, verbatim ------------------------------

const BIP173_VALID_BECH32 = [
  "A12UEL5L",
  "a12uel5l",
  "an83characterlonghumanreadablepartthatcontainsthenumber1andtheexcludedcharactersbio1tt5tgs",
  "abcdef1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqxw",
  "11qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqc8247j",
  "split1checkupstagehandshakeupstreamerranterredcaperred2y9e3w",
  "?1ezyfcl",
] as const;

const BIP173_INVALID_BECH32 = [
  ["\x201nwldj5", "HRP character out of range"],
  ["\x7f1axkwrx", "HRP character out of range"],
  ["\x801eym55h", "HRP character out of range"],
  ["an84characterslonghumanreadablepartthatcontainsthenumber1andtheexcludedcharactersbio1569pvx", "overall max length exceeded"],
  ["pzry9x0s0muk", "No separator character"],
  ["1pzry9x0s0muk", "Empty HRP"],
  ["x1b4n0q5v", "Invalid data character"],
  ["li1dgmt3", "Too short checksum"],
  ["de1lg7wt\xff", "Invalid character in checksum"],
  ["A1G7SGD8", "checksum calculated with uppercase form of HRP"],
  ["10a06t8", "empty HRP"],
  ["1qzzfhee", "empty HRP"],
] as const;

const BIP173_VALID_ADDRESSES = [
  ["BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4", "0014751e76e8199196d454941c45d1b3a323f1433bd6"],
  ["tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7", "00201863143c14c5166804bd19203356da136c985678cd4d27a1b8c6329604903262"],
  ["bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7k7grplx", "5128751e76e8199196d454941c45d1b3a323f1433bd6751e76e8199196d454941c45d1b3a323f1433bd6"],
  ["BC1SW50QA3JX3S", "6002751e"],
  ["bc1zw508d6qejxtdg4y5r3zarvaryvg6kdaj", "5210751e76e8199196d454941c45d1b3a323"],
  ["tb1qqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesrxh6hy", "0020000000c4a5cad46221b2a187905e5266362b99d5e91c6ce24d165dab93e86433"],
] as const;

const BIP173_INVALID_ADDRESSES = [
  ["tc1qw508d6qejxtdg4y5r3zarvary0c5xw7kg3g4ty", "Invalid human-readable part"],
  ["bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5", "Invalid checksum"],
  ["BC13W508D6QEJXTDG4Y5R3ZARVARY0C5XW7KN40WF2", "Invalid witness version"],
  ["bc1rw5uspcuh", "Invalid program length"],
  ["bc10w508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kw5rljs90", "Invalid program length"],
  ["BC1QR508D6QEJXTDG4Y5R3ZARVARYV98GJ9P", "Invalid program length for witness version 0 (per BIP141)"],
  ["tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sL5k7", "Mixed case"],
  ["bc1zw508d6qejxtdg4y5r3zarvaryvqyzf3du", "zero padding of more than 4 bits"],
  ["tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3pjxtptv", "Non-zero padding in 8-to-5 conversion"],
  ["bc1gmk9yu", "Empty data section"],
] as const;

const BIP350_VALID_BECH32M = [
  "A1LQFN3A",
  "a1lqfn3a",
  "an83characterlonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11sg7hg6",
  "abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx",
  "11llllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllllludsr8",
  "split1checkupstagehandshakeupstreamerranterredcaperredlc445v",
  "?1v759aa",
] as const;

const BIP350_INVALID_BECH32M = [
  ["\x201xj0phk", "HRP character out of range"],
  ["\x7f1g6xzxy", "HRP character out of range"],
  ["\x801vctc34", "HRP character out of range"],
  ["an84characterslonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11d6pts4", "overall max length exceeded"],
  ["qyrz8wqd2c9m", "No separator character"],
  ["1qyrz8wqd2c9m", "Empty HRP"],
  ["y1b0jsk6g", "Invalid data character"],
  ["lt1igcx5c0", "Invalid data character"],
  ["in1muywd", "Too short checksum"],
  ["mm1crxm3i", "Invalid character in checksum"],
  ["au1s5cgom", "Invalid character in checksum"],
  ["M1VUXWEZ", "checksum calculated with uppercase form of HRP"],
  ["16plkw9", "empty HRP"],
  ["1p2gdwpf", "empty HRP"],
] as const;

const BIP350_VALID_ADDRESSES = [
  ["BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4", "0014751e76e8199196d454941c45d1b3a323f1433bd6"],
  ["tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7", "00201863143c14c5166804bd19203356da136c985678cd4d27a1b8c6329604903262"],
  ["bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kt5nd6y", "5128751e76e8199196d454941c45d1b3a323f1433bd6751e76e8199196d454941c45d1b3a323f1433bd6"],
  ["BC1SW50QGDZ25J", "6002751e"],
  ["bc1zw508d6qejxtdg4y5r3zarvaryvaxxpcs", "5210751e76e8199196d454941c45d1b3a323"],
  ["tb1qqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesrxh6hy", "0020000000c4a5cad46221b2a187905e5266362b99d5e91c6ce24d165dab93e86433"],
  ["tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c", "5120000000c4a5cad46221b2a187905e5266362b99d5e91c6ce24d165dab93e86433"],
  ["bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0", "512079be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"],
] as const;

const BIP350_INVALID_ADDRESSES = [
  ["tc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq5zuyut", "Invalid human-readable part"],
  ["bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd", "Invalid checksum (Bech32 instead of Bech32m)"],
  ["tb1z0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqglt7rf", "Invalid checksum (Bech32 instead of Bech32m)"],
  ["BC1S0XLXVLHEMJA6C4DQV22UAPCTQUPFHLXM9H8Z3K2E72Q4K9HCZ7VQ54WELL", "Invalid checksum (Bech32 instead of Bech32m)"],
  ["bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh", "Invalid checksum (Bech32m instead of Bech32)"],
  ["tb1q0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq24jc47", "Invalid checksum (Bech32m instead of Bech32)"],
  ["bc1p38j9r5y49hruaue7wxjce0updqjuyyx0kh56v8s25huc6995vvpql3jow4", "Invalid character in checksum"],
  ["BC130XLXVLHEMJA6C4DQV22UAPCTQUPFHLXM9H8Z3K2E72Q4K9HCZ7VQ7ZWS8R", "Invalid witness version"],
  ["bc1pw5dgrnzv", "Invalid program length (1 byte)"],
  ["bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7v8n0nx0muaewav253zgeav", "Invalid program length (41 bytes)"],
  ["BC1QR508D6QEJXTDG4Y5R3ZARVARYV98GJ9P", "Invalid program length for witness version 0 (per BIP141)"],
  ["tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq47Zagq", "Mixed case"],
  ["bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7v07qwwzcrf", "zero padding of more than 4 bits"],
  ["tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vpggkg4j", "Non-zero padding in 8-to-5 conversion"],
  ["bc1gmk9yu", "Empty data section"],
] as const;

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

/** The scriptPubKey a witness program pays to: OP_n, push length, program. */
function scriptPubKey(version: number, program: Uint8Array): string {
  const op = version === 0 ? 0 : 0x50 + version;
  return hex(Uint8Array.from([op, program.length, ...program]));
}

/** Decode either network, as the BIPs' reference tests do. */
function decodeAny(address: string) {
  return decodeSegwitAddress("bc", address) ?? decodeSegwitAddress("tb", address);
}

describe("sha256", () => {
  const digest = (text: string) => hex(sha256(new TextEncoder().encode(text)));

  it("matches the FIPS 180-4 examples", () => {
    expect(digest("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(digest("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(digest("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
    );
  });

  it("matches node:crypto at every padding boundary and beyond", () => {
    for (const length of [0, 1, 54, 55, 56, 63, 64, 65, 119, 120, 128, 1000]) {
      const input = randomBytes(length);
      expect(hex(sha256(input))).toBe(createHash("sha256").update(input).digest("hex"));
    }
  });
});

describe("bech32Decode (BIP 173 and BIP 350 string vectors)", () => {
  it.each(BIP173_VALID_BECH32)("reads %s as bech32", (value) => {
    expect(bech32Decode(value)?.encoding).toBe("bech32");
  });

  it.each(BIP350_VALID_BECH32M)("reads %s as bech32m", (value) => {
    expect(bech32Decode(value)?.encoding).toBe("bech32m");
  });

  it.each([...BIP173_INVALID_BECH32, ...BIP350_INVALID_BECH32M])(
    "refuses %j (%s)",
    (value) => {
      expect(bech32Decode(value)).toBeNull();
    }
  );
});

describe("decodeSegwitAddress (BIP 350 address vectors)", () => {
  it.each(BIP350_VALID_ADDRESSES)("decodes %s", (address, expected) => {
    const decoded = decodeAny(address);
    expect(decoded).not.toBeNull();
    expect(scriptPubKey(decoded!.version, decoded!.program)).toBe(expected);
  });

  it.each(BIP350_INVALID_ADDRESSES)("refuses %s (%s)", (address) => {
    expect(decodeAny(address)).toBeNull();
  });

  it.each(BIP173_INVALID_ADDRESSES)("refuses BIP 173's invalid %s (%s)", (address) => {
    expect(decodeAny(address)).toBeNull();
  });

  it("still accepts BIP 173's v0 addresses, which kept bech32", () => {
    const v0 = BIP173_VALID_ADDRESSES.filter(([, spk]) => spk.startsWith("00"));
    expect(v0.length).toBeGreaterThan(0);
    for (const [address, spk] of v0) {
      const decoded = decodeAny(address);
      expect(decoded && scriptPubKey(decoded.version, decoded.program)).toBe(spk);
    }
  });

  it("refuses BIP 173's v1+ addresses, which BIP 350 moved to bech32m", () => {
    const later = BIP173_VALID_ADDRESSES.filter(([, spk]) => !spk.startsWith("00"));
    expect(later.length).toBeGreaterThan(0);
    for (const [address] of later) expect(decodeAny(address)).toBeNull();
  });
});

// Real mainnet addresses: Satoshi's genesis coinbase, the BIP 21 example,
// the Bitcoin wiki's P2PKH and P2SH examples, and a P2WPKH and Taproot pair.
const GOOD = [
  ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "p2pkh"],
  ["1BoatSLRHtKNngkdXEeobR76b53LETtpyT", "p2pkh"],
  ["1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", "p2pkh"],
  ["3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy", "p2sh"],
  ["bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", "segwit"],
  ["bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0", "segwit"],
] as const;

describe("checkBitcoinAddress", () => {
  it.each(GOOD)("accepts %s as %s", (address, type) => {
    const result = checkBitcoinAddress(address);
    expect(result).toEqual({ ok: true, address, type });
  });

  it("agrees with node:crypto's double SHA-256 on every legacy checksum", () => {
    for (const [address] of GOOD.filter(([a]) => !a.startsWith("bc1"))) {
      const bytes = base58Decode(address)!;
      expect(bytes.length).toBe(25);
      const once = createHash("sha256").update(bytes.subarray(0, 21)).digest();
      const twice = createHash("sha256").update(once).digest();
      expect(Buffer.from(bytes.subarray(21)).equals(twice.subarray(0, 4))).toBe(true);
    }
  });

  /** Every single-character substitution, at every position. */
  function substitutions(address: string, alphabet: string): string[] {
    const out: string[] = [];
    for (let i = 0; i < address.length; i += 1) {
      for (const char of alphabet) {
        if (char === address[i]) continue;
        out.push(address.slice(0, i) + char + address.slice(i + 1));
      }
    }
    return out;
  }

  it("catches every single-character change to a legacy and a P2SH address", () => {
    // Base58Check's 32-bit checksum would let about one change in four
    // billion through; at this count, none should, and none do.
    const base58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    for (const address of ["1BoatSLRHtKNngkdXEeobR76b53LETtpyT", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"]) {
      // Position 0 changes the prefix and is a different error; skip it.
      const changed = substitutions(address, base58).filter((a) => a[0] === address[0]);
      for (const typo of changed) expect(isBitcoinAddress(typo)).toBe(false);
    }
  });

  it("catches every single-character change to a bech32 and a bech32m address", () => {
    // Bech32 guarantees detection of any four substitutions, so one is
    // always caught. The data part starts after "bc1".
    const charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    for (const address of [
      "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
    ]) {
      const changed = substitutions(address, charset).filter((a) => a.startsWith("bc1"));
      for (const typo of changed) expect(isBitcoinAddress(typo)).toBe(false);
    }
  });

  it("says a mistyped address has a mistake, not that it is not an address", () => {
    const result = checkBitcoinAddress("1BoatSLRHtKNngkdXEeobR76b53LETtpyU");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/checksum does not match/);
  });

  it("explains mixed case, testnet and a non-address separately", () => {
    const reason = (value: string) => {
      const result = checkBitcoinAddress(value);
      return result.ok ? null : result.reason;
    };
    expect(reason("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdQ")).toMatch(/lowercase or all capitals/);
    expect(reason("tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7")).toMatch(
      /testnet/
    );
    expect(reason("send me money")).toMatch(/does not look like a Bitcoin address/);
    expect(reason("")).toMatch(/Enter the Bitcoin address/);
  });

  it("accepts an all-capitals bc1 address and writes it lowercase", () => {
    const result = checkBitcoinAddress("BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4");
    expect(result).toEqual({
      ok: true,
      address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
      type: "segwit",
    });
  });

  it.each(["2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc", "mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn"])(
    "refuses the valid testnet base-58 address %s, saying why",
    (address) => {
      // Checksums pass; the version byte (0xc4, 0x6f) is testnet's.
      const result = checkBitcoinAddress(address);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/testnet/);
    }
  );
});

describe("buildStaticPayload, bitcoin", () => {
  it("carries the checked address into the BIP 21 URI", () => {
    const result = buildStaticPayload("bitcoin", {
      address: "BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4",
    });
    expect(result).toEqual({
      ok: true,
      content: "bitcoin:bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    });
  });

  it("refuses a one-character typo with the checksum message", () => {
    const result = buildStaticPayload("bitcoin", {
      address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdp",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/mistake/);
  });
});
