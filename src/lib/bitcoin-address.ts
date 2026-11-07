import { sha256 } from "@/lib/sha256";

/**
 * Validating a Bitcoin address, checksum included.
 *
 * A static Bitcoin code is printed once and never changes, so a single wrong
 * character sends every payment to an address nobody holds. Both address
 * formats carry a checksum for exactly this, and it is verified here:
 *
 * - **Legacy (`1…`) and P2SH (`3…`)**: Base58Check. 25 bytes: a version byte
 *   (0x00 or 0x05 on mainnet), a 20-byte hash, then the first four bytes of
 *   SHA-256(SHA-256(version + hash)).
 * - **Native SegWit (`bc1…`)**: BIP 173 bech32 for witness version 0, with a
 *   20- or 32-byte program; BIP 350 bech32m for versions 1 to 16 (Taproot is
 *   v1). Mixed case is refused, as both BIPs require.
 *
 * Mainnet only: a testnet address cannot receive a real payment.
 *
 * Pure and synchronous, so the form can check as the person types and jest
 * can pin it against the BIPs' own test vectors.
 */

export type AddressCheck =
  | { ok: true; address: string; type: "p2pkh" | "p2sh" | "segwit" }
  | { ok: false; reason: string };

const SHAPE_REASON =
  "That does not look like a Bitcoin address. A mainnet address starts with 1, 3 or bc1.";
const TYPO_REASON =
  "That Bitcoin address has a mistake in it: its checksum does not match, so a character is wrong, missing or extra. Copy it again from the wallet rather than typing it.";
const TESTNET_REASON =
  "That is a testnet address, which cannot receive real bitcoin. Use a mainnet address, starting with 1, 3 or bc1.";

// --- Base58Check ------------------------------------------------------------

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Decode base-58 to bytes, or null on a character outside the alphabet. */
export function base58Decode(value: string): Uint8Array | null {
  const bytes: number[] = [];
  for (const char of value) {
    let carry = BASE58.indexOf(char);
    if (carry < 0) return null;
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Each leading "1" is a leading zero byte.
  for (const char of value) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

function checkBase58Address(value: string): AddressCheck {
  const bytes = base58Decode(value);
  if (!bytes || bytes.length !== 25) return { ok: false, reason: TYPO_REASON };

  const payload = bytes.subarray(0, 21);
  const digest = sha256(sha256(payload));
  for (let i = 0; i < 4; i += 1) {
    if (bytes[21 + i] !== digest[i]) return { ok: false, reason: TYPO_REASON };
  }

  // The checksum passed, so this is the version the address was made with.
  if (bytes[0] === 0x00) return { ok: true, address: value, type: "p2pkh" };
  if (bytes[0] === 0x05) return { ok: true, address: value, type: "p2sh" };
  if (bytes[0] === 0x6f || bytes[0] === 0xc4) return { ok: false, reason: TESTNET_REASON };
  return { ok: false, reason: SHAPE_REASON };
}

// --- Bech32 and Bech32m -----------------------------------------------------

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

export type Bech32Encoding = "bech32" | "bech32m";
const CONSTANT: Record<Bech32Encoding, number> = { bech32: 1, bech32m: 0x2bc830a3 };

function polymod(values: number[]): number {
  let chk = 1;
  for (const value of values) {
    const top = chk >>> 25;
    chk = (((chk & 0x1ffffff) << 5) ^ value) >>> 0;
    for (let i = 0; i < 5; i += 1) {
      if ((top >>> i) & 1) chk = (chk ^ GENERATOR[i]) >>> 0;
    }
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const char of hrp) out.push(char.charCodeAt(0) >> 5);
  out.push(0);
  for (const char of hrp) out.push(char.charCodeAt(0) & 31);
  return out;
}

export type Bech32Decoded = {
  hrp: string;
  /** 5-bit words, checksum removed. */
  data: number[];
  encoding: Bech32Encoding;
};

/**
 * Decode a bech32 or bech32m string, following the BIPs' reference decoder.
 * Null for anything malformed: bad characters, mixed case, no separator, an
 * empty human-readable part, more than 90 characters, or a checksum that
 * matches neither constant.
 */
export function bech32Decode(value: string): Bech32Decoded | null {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 33 || code > 126) return null;
  }
  if (value.toLowerCase() !== value && value.toUpperCase() !== value) return null;
  const lower = value.toLowerCase();

  const separator = lower.lastIndexOf("1");
  if (separator < 1 || separator + 7 > lower.length || lower.length > 90) return null;

  const hrp = lower.slice(0, separator);
  const data: number[] = [];
  for (const char of lower.slice(separator + 1)) {
    const word = CHARSET.indexOf(char);
    if (word < 0) return null;
    data.push(word);
  }

  const residue = polymod([...hrpExpand(hrp), ...data]);
  const encoding = (Object.keys(CONSTANT) as Bech32Encoding[]).find(
    (name) => CONSTANT[name] === residue
  );
  if (!encoding) return null;
  return { hrp, data: data.slice(0, -6), encoding };
}

/** Regroup bits, refusing leftover padding as the BIPs require. */
function convertBits(data: number[], from: number, to: number): number[] | null {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const max = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || value >> from !== 0) return null;
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & max);
    }
  }
  if (bits >= from || ((acc << (to - bits)) & max) !== 0) return null;
  return out;
}

export type WitnessProgram = { version: number; program: Uint8Array };

/**
 * Decode a native SegWit address for one network (`bc` mainnet, `tb`
 * testnet), or null if it is not a valid one under BIP 173 and BIP 350.
 */
export function decodeSegwitAddress(hrp: string, address: string): WitnessProgram | null {
  const decoded = bech32Decode(address);
  if (!decoded || decoded.hrp !== hrp || decoded.data.length < 1) return null;

  const [version, ...words] = decoded.data;
  if (version > 16) return null;

  const program = convertBits(words, 5, 8);
  if (!program || program.length < 2 || program.length > 40) return null;
  if (version === 0 && program.length !== 20 && program.length !== 32) return null;

  // BIP 350: v0 keeps bech32, every later version uses bech32m.
  if (decoded.encoding !== (version === 0 ? "bech32" : "bech32m")) return null;

  return { version, program: Uint8Array.from(program) };
}

function checkSegwitAddress(value: string): AddressCheck {
  if (value.toLowerCase() !== value && value.toUpperCase() !== value) {
    return {
      ok: false,
      reason:
        "A bc1 address is either all lowercase or all capitals, never a mix. Copy it again from the wallet.",
    };
  }
  if (!decodeSegwitAddress("bc", value)) return { ok: false, reason: TYPO_REASON };
  // Lowercase is the form every wallet reads; capitals are only for QR
  // alphanumeric mode, which a BIP 21 URI with parameters cannot use anyway.
  return { ok: true, address: value.toLowerCase(), type: "segwit" };
}

// --- Entry point ------------------------------------------------------------

export function checkBitcoinAddress(raw: string): AddressCheck {
  const value = raw.trim();
  if (!value) return { ok: false, reason: "Enter the Bitcoin address to be paid." };

  if (/^bc1/i.test(value)) return checkSegwitAddress(value);
  if (/^(tb1|bcrt1)/i.test(value)) return { ok: false, reason: TESTNET_REASON };
  // 1 and 3 are mainnet; m, n and 2 are testnet, which the version byte
  // confirms once the checksum has passed.
  if (/^[13mn2][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(value)) return checkBase58Address(value);
  return { ok: false, reason: SHAPE_REASON };
}

export function isBitcoinAddress(value: string): boolean {
  return checkBitcoinAddress(value).ok;
}
