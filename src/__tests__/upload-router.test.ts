/**
 * The page-file upload checks (security audit M4): who may upload a page
 * file, and how much an account may store. The router is built through a
 * stand-in `createUploadthing` that keeps each endpoint's middleware and
 * completion callback, so the real checks run without UploadThing.
 */

type Handlers = { middleware?: (args: unknown) => Promise<unknown>; complete?: (args: unknown) => Promise<unknown> };
const endpoints: Handlers[] = [];

jest.mock("uploadthing/next", () => ({
  createUploadthing: () => () => {
    const handlers: Handlers = {};
    endpoints.push(handlers);
    const builder = {
      middleware(fn: Handlers["middleware"]) {
        handlers.middleware = fn;
        return builder;
      },
      onUploadComplete(fn: Handlers["complete"]) {
        handlers.complete = fn;
        return builder;
      },
    };
    return builder;
  },
}));

const deleteFiles = jest.fn(async () => ({}));
jest.mock("uploadthing/server", () => ({
  UploadThingError: class UploadThingError extends Error {},
  UTApi: class {
    deleteFiles = deleteFiles;
  },
}));

const resolveScope = jest.fn();
jest.mock("@/lib/resolve-scope", () => ({ resolveScope: () => resolveScope() }));

const getEntitlement = jest.fn();
jest.mock("@/lib/entitlement", () => ({
  ...jest.requireActual("@/lib/entitlement"),
  getEntitlement: (id: string) => getEntitlement(id),
}));

const hasPageCodes = jest.fn();
const storageUsed = jest.fn();
const recordFile = jest.fn();
jest.mock("@/lib/files", () => {
  const actual = jest.requireActual("@/lib/files");
  return {
    StorageFullError: actual.StorageFullError,
    hasPageCodes: (...a: unknown[]) => hasPageCodes(...a),
    storageUsed: (...a: unknown[]) => storageUsed(...a),
    recordFile: (...a: unknown[]) => recordFile(...a),
  };
});
jest.mock("@/lib/db", () => ({ query: jest.fn(), queryOne: jest.fn(), withTransaction: jest.fn() }));
jest.mock("@/lib/refusals", () => ({ featureRefusal: async () => "Hosted pages are on other plans." }));
jest.mock("@/lib/user-codes", () => ({ videoRefusal: async () => "Video is on other plans." }));
jest.mock("@/lib/auth/server", () => ({ auth: {} }));
jest.mock("@/lib/admin", () => ({ isAdmin: jest.fn() }));
jest.mock("@/lib/blog", () => ({ recordBlogImage: jest.fn() }));
jest.mock("@/lib/logos", () => ({
  countLogos: jest.fn(),
  loadLogo: jest.fn(),
  recordLogo: jest.fn(),
  MAX_LOGOS: 20,
}));

import { uploadRouter } from "@/app/api/uploadthing/core";
import { StorageFullError } from "@/lib/files";

const MB = 1024 * 1024;
const ORDER = Object.keys(uploadRouter) as (keyof typeof uploadRouter)[];
function endpoint(name: keyof typeof uploadRouter): Handlers {
  return endpoints[ORDER.indexOf(name)];
}

const owner = { accountId: "acct", actorId: "acct", role: "owner" };

function plan(features: Record<string, unknown>) {
  return { planName: "Plan", planSlug: "plan", features, active: true };
}

const picked = (...sizes: number[]) => ({ files: sizes.map((size) => ({ name: "f", size, type: "application/pdf" })) });

beforeEach(() => {
  jest.clearAllMocks();
  resolveScope.mockResolvedValue(owner);
  hasPageCodes.mockResolvedValue(false);
  storageUsed.mockResolvedValue(0);
});

describe("who may upload a page file", () => {
  it.each(["pageImage", "pagePdf", "pageAudio", "pageVideo"] as const)(
    "%s refuses a plan without hosted pages and no pages, before any URL is handed out",
    async (name) => {
      getEntitlement.mockResolvedValue(plan({ video_uploads: true }));
      await expect(endpoint(name).middleware!(picked(MB))).rejects.toThrow("Hosted pages are on other plans.");
    }
  );

  it("lets an account that kept its pages after a downgrade edit them", async () => {
    getEntitlement.mockResolvedValue(plan({ storage_mb: 25 }));
    hasPageCodes.mockResolvedValue(true);
    await expect(endpoint("pageImage").middleware!(picked(MB))).resolves.toEqual({
      accountId: "acct",
      quotaBytes: 25 * MB,
    });
  });

  it("refuses an account with no plan at all", async () => {
    getEntitlement.mockResolvedValue(null);
    await expect(endpoint("pagePdf").middleware!(picked(MB))).rejects.toThrow("Hosted pages");
  });

  it("still needs video_uploads for video", async () => {
    getEntitlement.mockResolvedValue(plan({ hosted_pages: true }));
    await expect(endpoint("pageVideo").middleware!(picked(MB))).rejects.toThrow("Video is on other plans.");
  });

  it("refuses someone signed out", async () => {
    resolveScope.mockResolvedValue(null);
    await expect(endpoint("pagePdf").middleware!(picked(MB))).rejects.toThrow("Sign in");
  });
});

describe("how much an account may store", () => {
  it("allows an upload that fits, and carries the allowance to the callback", async () => {
    getEntitlement.mockResolvedValue(plan({ hosted_pages: true, storage_mb: 250 }));
    storageUsed.mockResolvedValue(200 * MB);
    await expect(endpoint("pagePdf").middleware!(picked(16 * MB))).resolves.toEqual({
      accountId: "acct",
      quotaBytes: 250 * MB,
    });
  });

  it("counts every file in the request together", async () => {
    getEntitlement.mockResolvedValue(plan({ hosted_pages: true, storage_mb: 250 }));
    storageUsed.mockResolvedValue(220 * MB);
    await expect(endpoint("pageAudio").middleware!(picked(16 * MB, 16 * MB))).rejects.toThrow(
      "30 MB of its 250 MB for page files left"
    );
  });

  it("gives a plan with no value the default, never no limit", async () => {
    getEntitlement.mockResolvedValue(plan({ hosted_pages: true }));
    storageUsed.mockResolvedValue(99 * MB);
    await expect(endpoint("pageImage").middleware!(picked(2 * MB))).rejects.toThrow("100 MB");
  });
});

describe("when a file lands", () => {
  const landed = {
    metadata: { accountId: "acct", quotaBytes: 250 * MB },
    file: { key: "k1", ufsUrl: "https://x.ufs.sh/f/k1", name: "menu.pdf", type: "application/pdf", size: MB },
  };

  it("records it against the allowance the middleware worked out", async () => {
    recordFile.mockResolvedValue({ id: "7", url: landed.file.ufsUrl, name: "menu.pdf", mime: "application/pdf" });
    await expect(endpoint("pagePdf").complete!(landed)).resolves.toMatchObject({ fileId: "7" });
    expect(recordFile.mock.calls[0][2]).toBe(250 * MB);
    expect(deleteFiles).not.toHaveBeenCalled();
  });

  it("deletes a file that raced past the allowance", async () => {
    recordFile.mockRejectedValue(new StorageFullError("acct"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await expect(endpoint("pagePdf").complete!(landed)).rejects.toBeInstanceOf(StorageFullError);
    expect(deleteFiles).toHaveBeenCalledWith("k1");
    warn.mockRestore();
  });
});
