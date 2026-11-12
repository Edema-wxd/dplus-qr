/** @jest-environment node */

import { contentDisposition } from "@/lib/content-disposition";

const loadPublicPage = jest.fn();
jest.mock("next/server", () => ({ connection: async () => {} }));
jest.mock("@/lib/public-page", () => ({
  loadPublicPage: (...args: unknown[]) => loadPublicPage(...args),
}));
const allowDocumentFetch = jest.fn();
jest.mock("@/lib/ratelimit", () => ({
  allowDocumentFetch: (...args: unknown[]) => allowDocumentFetch(...args),
}));

import { GET } from "@/app/p/[code]/[file]/route";
import { documentQuery } from "@/lib/document-address";

/**
 * `/p/{code}/document` is a PDF page's permanent address: the in-page viewer
 * reads it, and it is the link that survives the owner replacing the file.
 */

const FILE_URL = "https://fmctfyekk3.ufs.sh/f/abc123";
const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\n...");

function pdfPage(url = FILE_URL, name = "Autumn menu.pdf") {
  return {
    state: "page",
    kind: "pdf",
    content: { title: "Menu", description: "", file: { fileId: "1", url, name, mime: "application/pdf" } },
  };
}

function get(path: string, code = "Ab3dEf9", file = "document") {
  return GET(new Request(`https://qriateplus.com/p/${code}/${path}`), {
    params: Promise.resolve({ code, file }),
  });
}

/** Like a browser: one redirect to the versioned address, then the file. */
async function open(path: string) {
  const first = await get(path);
  if (first.status !== 302) return first;
  const location = first.headers.get("location")!;
  expect(location).toMatch(/^\/p\/Ab3dEf9\/document\?v=[0-9a-f]{16}(&download)?$/);
  return get(location.replace("/p/Ab3dEf9/", ""));
}

const realFetch = global.fetch;
const fetchMock = jest.fn();

beforeEach(() => {
  loadPublicPage.mockReset();
  allowDocumentFetch.mockReset().mockResolvedValue(true);
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe("/p/{code}/document", () => {
  it("streams the page's current file as a PDF, whatever UploadThing called it", async () => {
    loadPublicPage.mockResolvedValue(pdfPage());
    fetchMock.mockResolvedValue(
      new Response(PDF_BYTES, { headers: { "content-type": "application/octet-stream", "content-length": "12" } })
    );

    const response = await open("document");

    expect(fetchMock).toHaveBeenCalledWith(FILE_URL, { cache: "no-store" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    // Browsers keep nothing; the CDN keeps this version for a minute.
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("public, max-age=60");
    expect(response.headers.get("content-length")).toBe("12");
    expect(response.headers.get("content-disposition")).toMatch(/^inline; /);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF_BYTES);
  });

  it("drops a compressed upstream's length, which would cut the PDF short", async () => {
    loadPublicPage.mockResolvedValue(pdfPage());
    fetchMock.mockResolvedValue(
      new Response(PDF_BYTES, { headers: { "content-encoding": "gzip", "content-length": "5" } })
    );
    const response = await open("document");
    expect(response.headers.get("content-length")).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF_BYTES);
  });

  it("offers the same file as a download with ?download", async () => {
    loadPublicPage.mockResolvedValue(pdfPage());
    fetchMock.mockResolvedValue(new Response(PDF_BYTES));
    const response = await open("document?download");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; /);
  });

  it("follows a replaced file without the link changing", async () => {
    loadPublicPage.mockResolvedValue(pdfPage("https://fmctfyekk3.ufs.sh/f/first"));
    fetchMock.mockImplementation(async () => new Response(PDF_BYTES));
    await open("document");
    loadPublicPage.mockResolvedValue(pdfPage("https://fmctfyekk3.ufs.sh/f/second"));
    await open("document");

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://fmctfyekk3.ufs.sh/f/first",
      "https://fmctfyekk3.ufs.sh/f/second",
    ]);
  });

  it("sends every reader to one address per file version, which the CDN can keep (audit L10)", async () => {
    loadPublicPage.mockResolvedValue(pdfPage());
    const bare = await get("document");
    expect(bare.status).toBe(302);
    expect(bare.headers.get("location")).toBe(`/p/Ab3dEf9/document${documentQuery(FILE_URL, false)}`);
    expect(bare.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();

    const download = await get("document?download");
    expect(download.headers.get("location")).toBe(`/p/Ab3dEf9/document${documentQuery(FILE_URL, true)}`);
  });

  it("changes the address when the file is replaced", () => {
    expect(documentQuery("https://fmctfyekk3.ufs.sh/f/first", false)).not.toBe(
      documentQuery("https://fmctfyekk3.ufs.sh/f/second", false)
    );
    expect(documentQuery(FILE_URL, false)).not.toContain("abc123");
  });

  it.each([
    ["a stale version", "document?v=0000000000000000"],
    ["an extra parameter added to dodge the cache", `document${documentQuery(FILE_URL, false)}&x=1`],
    ["parameters in another order", `document?download&v=${documentQuery(FILE_URL, false).slice(3)}`],
  ])("redirects %s without fetching the file", async (_label, path) => {
    loadPublicPage.mockResolvedValue(pdfPage());
    expect((await get(path)).status).toBe(302);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a visitor over the limit, before fetching", async () => {
    loadPublicPage.mockResolvedValue(pdfPage());
    allowDocumentFetch.mockResolvedValue(false);
    const response = await open("document");
    expect(response.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("will not fetch a stored URL that is not UploadThing's", async () => {
    loadPublicPage.mockResolvedValue(pdfPage("http://169.254.169.254/latest/meta-data"));
    const response = await open("document");
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["paused", "blocked", "not_found", "broken"])("is gone while the page is %s", async (state) => {
    loadPublicPage.mockResolvedValue({ state });
    const response = await open("document");
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is only offered by a PDF page", async () => {
    loadPublicPage.mockResolvedValue({ state: "page", kind: "menu", content: {} });
    expect((await open("document")).status).toBe(404);
  });

  it("answers 502, not a broken PDF, when UploadThing does not deliver", async () => {
    loadPublicPage.mockResolvedValue(pdfPage());
    fetchMock.mockResolvedValue(new Response("gone", { status: 404 }));
    expect((await open("document")).status).toBe(502);

    fetchMock.mockRejectedValue(new Error("network down"));
    expect((await open("document")).status).toBe(502);
  });
});

describe("contentDisposition", () => {
  it("keeps a plain name as it is", () => {
    expect(contentDisposition("menu.pdf", false)).toBe(`inline; filename="menu.pdf"; filename*=UTF-8''menu.pdf`);
  });

  it("adds the extension when the name lacks one", () => {
    expect(contentDisposition("Menu", true)).toBe(`attachment; filename="Menu.pdf"; filename*=UTF-8''Menu.pdf`);
  });

  it("cannot be broken out of by a quote or a header injection", () => {
    const header = contentDisposition('a";\r\nSet-Cookie: x=1.pdf', false);
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.match(/"/g)).toHaveLength(2);
  });

  it("keeps a non-ASCII name intact in filename*", () => {
    const header = contentDisposition("Menú (Jollof)'s.pdf", false);
    expect(header).toContain(`filename="Men_ (Jollof)'s.pdf"`);
    expect(header).toContain("filename*=UTF-8''Men%C3%BA%20%28Jollof%29%27s.pdf");
  });

  it("names an empty upload something", () => {
    expect(contentDisposition("  ", false)).toContain(`filename="document.pdf"`);
  });
});
