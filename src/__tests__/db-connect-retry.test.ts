/** @jest-environment node */

import type { Pool } from "pg";
import { query, queryOne, withTransaction } from "@/lib/db";
import { lookupDestination } from "@/lib/codes";
import { clearLocalCache } from "@/lib/cache";

/**
 * Neon pauses the database when idle, and the first connection afterwards can
 * outlast the 5-second limit. Everything but the redirect tries to connect
 * once more; the redirect gives up after one wait. Only connecting is ever
 * retried, never a statement.
 */

const timeout = () => new Error("Connection terminated due to connection timeout");

function client(rows: Record<string, unknown>[] = [{ ok: 1 }]) {
  return {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      void sql;
      void params;
      return { rows };
    }),
    release: jest.fn(),
  };
}

let pool: { connect: jest.Mock };

beforeEach(() => {
  pool = { connect: jest.fn() };
  global._qrPool = pool as unknown as Pool;
  clearLocalCache();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  global._qrPool = undefined;
  jest.restoreAllMocks();
});

describe("query", () => {
  it("connects again once when the first attempt times out, and answers", async () => {
    const c = client([{ n: 1 }]);
    pool.connect.mockRejectedValueOnce(timeout()).mockResolvedValueOnce(c);

    await expect(query("select 1")).resolves.toEqual([{ n: 1 }]);
    expect(pool.connect).toHaveBeenCalledTimes(2);
    expect(c.query).toHaveBeenCalledTimes(1);
    expect(c.release).toHaveBeenCalledWith();
  });

  it("gives up after the second failed attempt, with that error", async () => {
    const second = new Error("still asleep");
    pool.connect.mockRejectedValueOnce(timeout()).mockRejectedValueOnce(second);

    await expect(query("select 1")).rejects.toBe(second);
    expect(pool.connect).toHaveBeenCalledTimes(2);
  });

  it("never retries a statement that reached the database", async () => {
    const c = client();
    const failure = new Error("duplicate key value");
    c.query.mockRejectedValueOnce(failure);
    pool.connect.mockResolvedValue(c);

    await expect(query("insert ...")).rejects.toBe(failure);
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(c.query).toHaveBeenCalledTimes(1);
    // The client goes back marked broken, so the pool does not reuse it.
    expect(c.release).toHaveBeenCalledWith(failure);
  });

  it("tries once only when asked to fail fast", async () => {
    pool.connect.mockRejectedValueOnce(timeout()).mockResolvedValueOnce(client());

    await expect(queryOne("select 1", [], { failFast: true })).rejects.toThrow("connection timeout");
    expect(pool.connect).toHaveBeenCalledTimes(1);
  });
});

describe("withTransaction", () => {
  it("connects again once too", async () => {
    const c = client([{ id: 7 }]);
    pool.connect.mockRejectedValueOnce(timeout()).mockResolvedValueOnce(c);

    const result = await withTransaction(async (run) => run("select 7 as id"));
    expect(result).toEqual([{ id: 7 }]);
    expect(pool.connect).toHaveBeenCalledTimes(2);
    expect(c.query.mock.calls.map(([sql]) => sql)).toEqual(["begin", "select 7 as id", "commit"]);
  });
});

describe("the redirect's lookup", () => {
  it("tries to connect once only, so a scanner never waits twice", async () => {
    pool.connect.mockRejectedValueOnce(timeout()).mockResolvedValueOnce(client([]));

    await expect(lookupDestination("Ab3dEf9")).rejects.toThrow("connection timeout");
    expect(pool.connect).toHaveBeenCalledTimes(1);
  });
});
