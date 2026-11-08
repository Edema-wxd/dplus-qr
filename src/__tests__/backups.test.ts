const rows: { lastRun: unknown; lastOk: unknown } = { lastRun: null, lastOk: null };
jest.mock("@/lib/db", () => ({
  queryOne: async (sql: string) => (sql.includes("status = 'ok'") ? rows.lastOk : rows.lastRun),
}));
const alertOnce = jest.fn(async (..._args: [string, string, string]) => {});
jest.mock("@/lib/error-alerts", () => ({
  alertOnce: (key: string, subject: string, text: string) => alertOnce(key, subject, text),
}));

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkBackups, describeBackups, formatBytes, judgeBackups, type BackupRun } from "@/lib/backups";
import { BACKUP_KEEP_DAYS, BACKUP_STALE_HOURS } from "@/lib/backup-policy";
import { PRIVACY } from "@/lib/legal";
import vercel from "../../vercel.json";

const root = path.join(__dirname, "..", "..");
const workflow = readFileSync(path.join(root, ".github", "workflows", "backup.yml"), "utf8");
const NOW = new Date("2026-11-09T05:10:00Z");

const run = (at: string, status: "ok" | "failed" = "ok"): BackupRun => ({
  at: new Date(at),
  status,
  bytes: status === "ok" ? 2_516_582 : null,
  tables: status === "ok" ? 27 : null,
  rows: status === "ok" ? 48_211 : null,
  runUrl: "https://github.com/Edema-wxd/dplus-qr/actions/runs/1",
});
const dbRow = (r: BackupRun) => ({
  created_at: r.at,
  status: r.status,
  bytes: r.bytes === null ? null : String(r.bytes),
  tables: r.tables,
  row_count: r.rows === null ? null : String(r.rows),
  run_url: r.runUrl,
});

beforeEach(() => {
  rows.lastRun = null;
  rows.lastOk = null;
  alertOnce.mockClear();
});

describe("the backup job", () => {
  it("keeps copies exactly as long as the privacy page says", () => {
    expect(workflow).toContain(`retention-days: ${BACKUP_KEEP_DAYS}`);
    const privacy = JSON.stringify(PRIVACY);
    expect(privacy).toContain(`for ${BACKUP_KEEP_DAYS} days`);
    expect(privacy).toMatch(/GitHub cannot read it/);
  });

  it("runs nightly, before the morning check that looks for it", () => {
    expect(workflow).toContain('cron: "17 1 * * *"');
    const crons = Object.fromEntries(vercel.crons.map((c) => [c.path, c.schedule]));
    expect(crons["/api/cron/backups"]).toBe("10 5 * * *");
  });

  it("reads the database through a secret and encrypts to a public key, never holding the private one", () => {
    expect(workflow).toContain("secrets.BACKUP_DATABASE_URL");
    expect(workflow).toContain("vars.BACKUP_AGE_RECIPIENT");
    expect(workflow).not.toMatch(/AGE-SECRET-KEY|--identity|--decrypt/);
    expect(workflow).toContain("path: ${{ steps.backup.outputs.file }}");
    expect(readFileSync(path.join(root, "scripts", "backup", "backup.sh"), "utf8")).toMatch(/file="\$OUT_DIR\/\$name\.dump\.age"/);
  });
});

describe("backup.sh refuses what could do harm", () => {
  const script = path.join(root, "scripts", "backup", "backup.sh");
  const base = {
    PATH: process.env.PATH ?? "",
    SOURCE_URL: "postgres://u@ep-1.neon.tech/db",
    RESTORE_URL: "postgres://postgres@127.0.0.1:5432/postgres",
    AGE_RECIPIENT: "age1qqqq",
    OUT_DIR: mkdtempSync(path.join(tmpdir(), "bk-")),
  };
  const attempt = (env: Partial<typeof base>) => {
    const result = spawnSync("bash", [script], { env: { NODE_ENV: "test", ...base, ...env }, encoding: "utf8" });
    return { status: result.status, stderr: result.stderr };
  };

  it("will not dump through the pooler", () => {
    expect(attempt({ SOURCE_URL: "postgres://u@ep-1-pooler.neon.tech/db" })).toMatchObject({ status: 1, stderr: expect.stringMatching(/pooled/) });
  });

  it("will not empty the live database, or anything on Neon, for the restore test", () => {
    expect(attempt({ RESTORE_URL: base.SOURCE_URL })).toMatchObject({ status: 1, stderr: expect.stringMatching(/scratch/) });
    expect(attempt({ RESTORE_URL: "postgres://u@ep-2.neon.tech/other" })).toMatchObject({ status: 1, stderr: expect.stringMatching(/on Neon/) });
  });

  it("will not encrypt to something that is not an age public key", () => {
    expect(attempt({ AGE_RECIPIENT: "AGE-SECRET-KEY-1ABC" })).toMatchObject({ status: 1, stderr: expect.stringMatching(/age public key/) });
  });
});

describe("compare-counts.sh", () => {
  const script = path.join(root, "scripts", "backup", "compare-counts.sh");
  const dir = mkdtempSync(path.join(tmpdir(), "counts-"));
  const file = (name: string, lines: string[]) => {
    writeFileSync(path.join(dir, name), lines.map((l) => l.replace(" ", "\t")).join("\n") + "\n");
    return path.join(dir, name);
  };
  const source = file("source.tsv", ["public.qr_codes 10", "public.qr_scans 5000", "neon_auth.user 4"]);

  it("passes a copy that differs only by rows written after the dump", () => {
    const restored = file("ok.tsv", ["public.qr_codes 10", "public.qr_scans 4950", "neon_auth.user 4"]);
    expect(execFileSync("bash", [script, source, restored], { encoding: "utf8" })).toBe("");
  });

  it("fails a copy with a missing table or missing rows, and names them", () => {
    const restored = file("bad.tsv", ["public.qr_codes 0", "neon_auth.user 4"]);
    const result = spawnSync("bash", [script, source, restored], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("missing table public.qr_scans");
    expect(result.stdout).not.toContain("qr_codes");
  });
});

describe("knowing when backups have stopped", () => {
  it("tells never, fresh, and stale apart, at the edge of the window", () => {
    expect(judgeBackups(null, null, NOW).state).toBe("never");
    const edge = new Date(NOW.getTime() - BACKUP_STALE_HOURS * 3_600_000).toISOString();
    expect(judgeBackups(run(edge), run(edge), NOW).state).toBe("ok");
    const past = new Date(NOW.getTime() - BACKUP_STALE_HOURS * 3_600_000 - 60_000).toISOString();
    expect(judgeBackups(run(past), run(past), NOW).state).toBe("stale");
    expect(judgeBackups(run("2026-11-09T01:20:00Z", "failed"), null, NOW).state).toBe("stale");
  });

  it("describes each state in one line", () => {
    const ok = run("2026-11-09T01:21:00Z");
    expect(describeBackups(judgeBackups(ok, ok, NOW))).toBe(
      "Backups are working: last good backup 9 Nov, 01:21 UTC, 2.4 MB, 27 tables restored and checked."
    );
    expect(describeBackups(judgeBackups(run("2026-11-09T01:20:00Z", "failed"), run("2026-11-08T01:20:00Z"), NOW))).toBe(
      "Backups are working: last good backup 8 Nov, 01:20 UTC, 2.4 MB, 27 tables restored and checked. A later run failed 9 Nov, 01:20 UTC."
    );
    expect(describeBackups({ state: "never" })).toMatch(/not set up/);
    expect(formatBytes(512)).toBe("512 bytes");
    expect(formatBytes(80_220)).toBe("78 KB");
  });

  it("stays quiet before the first backup, and while backups work", async () => {
    await checkBackups(NOW);
    const ok = run("2026-11-09T01:21:00Z");
    rows.lastRun = dbRow(ok);
    rows.lastOk = dbRow(ok);
    await checkBackups(NOW);
    expect(alertOnce).not.toHaveBeenCalled();
  });

  it("emails staff when good backups stop", async () => {
    rows.lastRun = dbRow(run("2026-11-09T01:20:00Z", "failed"));
    rows.lastOk = dbRow(run("2026-11-07T01:20:00Z"));
    await checkBackups(NOW);
    expect(alertOnce).toHaveBeenCalledWith(
      "backups-stale",
      `No database backup in ${BACKUP_STALE_HOURS} hours`,
      expect.stringContaining("https://github.com/Edema-wxd/dplus-qr/actions/runs/1")
    );
  });

  it("says when one night failed while the previous copy is still recent", async () => {
    rows.lastRun = dbRow(run("2026-11-09T01:20:00Z", "failed"));
    rows.lastOk = dbRow(run("2026-11-08T01:20:00Z"));
    await checkBackups(NOW);
    expect(alertOnce).toHaveBeenCalledWith(
      "backup-failed:2026-11-09T01:20:00.000Z",
      "Last night's database backup failed",
      expect.stringContaining("nothing is at risk yet")
    );
  });
});
