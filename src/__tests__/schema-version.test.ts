import { readdirSync } from "node:fs";
import path from "node:path";
import { LATEST_MIGRATION } from "@/lib/schema-version";

describe("LATEST_MIGRATION", () => {
  it("names the newest file in db/migrations, so /health checks against the real schema", () => {
    const files = readdirSync(path.join(__dirname, "..", "..", "db", "migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(LATEST_MIGRATION).toBe(files.at(-1)!.replace(/\.sql$/, ""));
  });
});
