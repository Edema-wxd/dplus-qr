import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Every dashboard statement that touches a customer's data proves, in the
 * same statement, that the signed-in person may use the account
 * (`access()` in `src/lib/account-scope.ts`). That is the team-seats form of
 * CLAUDE.md's rule that every query filters by the session's user id, and
 * this test is what keeps a new query from quietly skipping it.
 *
 * It reads the modules the dashboard queries through, function by function.
 * A SQL template that names a customer table must carry `${access(` or a
 * `-- scope:` comment saying why it needs none (a write already proved in
 * the same transaction, an upload callback with no session). A whole
 * function may be exempt only by name, below, with its reason.
 */

const MODULES = [
  "src/lib/user-codes.ts",
  "src/lib/logos.ts",
  "src/lib/files.ts",
  "src/lib/stat-shares.ts",
  "src/lib/bulk-create.ts",
  "src/lib/onboarding.ts",
];

const CUSTOMER_TABLES =
  /\b(qr_codes|qr_logos|qr_files|qr_stat_shares|qr_feedback|qr_scans|qr_scan_daily|qr_scan_daily_visitors|qr_destination_history|qr_bulk_imports|qr_bulk_import_codes|qr_onboarding|qr_onboarding_steps)\b/;
const SQL = /\b(select|insert|update|delete)\b/i;

/** Functions without a scope, each authorised another way. */
const EXEMPT: Record<string, string> = {
  analyticsForCode: "staff (requireStaff) and public share links (loadSharedCode) authorise first",
  loadSharedCode: "the public share page: the token is the credential, checked with moderation in-query",
  onboardingFunnel: "the staff funnel at /admin/onboarding, behind requireStaff: counts across accounts",
  startOnboardingAtSignUp:
    "sign-up: the account Neon Auth created in the same request, before a session can be read",
};

const root = path.join(__dirname, "..", "..");

/** Top-level declarations and their source, split at each unindented declaration. */
function chunks(source: string): { name: string; body: string }[] {
  const starts = [...source.matchAll(/^(?:export )?(?:async )?(?:function|const|class) ([A-Za-z0-9_]+)/gm)];
  return starts.map((match, i) => ({
    name: match[1],
    body: source.slice(match.index!, starts[i + 1]?.index ?? source.length),
  }));
}

/** Template literals, nested `${...}` included in their text. */
function templates(body: string): string[] {
  return [...body.matchAll(/`(?:[^`\\]|\\.)*`/g)].map((m) => m[0]);
}

describe("every dashboard query proves access", () => {
  for (const file of MODULES) {
    const source = readFileSync(path.join(root, file), "utf8");
    for (const { name, body } of chunks(source)) {
      const sql = templates(body).filter((t) => SQL.test(t) && CUSTOMER_TABLES.test(t));
      if (sql.length === 0) continue;
      it(`${file}: ${name}`, () => {
        if (EXEMPT[name]) return;
        for (const statement of sql) {
          const guarded = statement.includes("${access(") || statement.includes("-- scope:");
          if (!guarded) throw new Error(`${name} has a query with no access check:\n${statement.slice(0, 300)}`);
        }
      });
    }
  }

  it("names only functions that exist", () => {
    const all = MODULES.map((f) => readFileSync(path.join(root, f), "utf8")).join("\n");
    for (const name of Object.keys(EXEMPT)) expect(all).toMatch(new RegExp(`function ${name}\\(`));
  });
});

describe("scopes come only from a session", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry);
      return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(entry) ? [full] : [];
    });
  }

  it("builds a scope nowhere but resolveScope and the tests", () => {
    const makers = files(path.join(root, "src"))
      .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`))
      .filter((f) => /\bscopeFor\(/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(root, f))
      .sort();
    expect(makers).toEqual(["src/lib/account-scope.ts", "src/lib/resolve-scope.ts"]);
  });

  it("resolves a scope from a bare user id only in the tests", () => {
    const callers = files(path.join(root, "src"))
      .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`))
      .filter((f) => /\baccessFor\(/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(root, f));
    expect(callers).toEqual(["src/lib/resolve-scope.ts"]);
  });

  it("takes a scope, never a bare user id, in every dashboard function that queries", () => {
    for (const file of MODULES) {
      const source = readFileSync(path.join(root, file), "utf8");
      const bare = [...source.matchAll(/^export async function (\w+)\(\s*userId: string/gm)]
        .map((match) => match[1])
        .filter((name) => !EXEMPT[name]);
      expect(bare).toEqual([]);
    }
  });
});
