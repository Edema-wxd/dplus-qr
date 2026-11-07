import {
  UPLOAD_LIMITS,
  batches,
  checkPicked,
  clientUploadMessage,
  limitBytes,
  unsavedUploadMessage,
  uploadRefusal,
} from "@/lib/upload-limits";

const MB = 1024 * 1024;
const file = (name: string, size: number) => ({ name, size });

describe("limitBytes", () => {
  it("counts a megabyte as UploadThing does, 1024 × 1024", () => {
    expect(limitBytes("pageImage")).toBe(4 * MB);
    expect(limitBytes("logo")).toBe(MB);
  });
});

describe("checkPicked", () => {
  it("passes files within the limit and the field's room", () => {
    const picked = [file("a.jpg", MB), file("b.jpg", 2 * MB)];
    expect(checkPicked("pageImage", picked, 20)).toEqual({ accepted: picked, problem: null });
  });

  it("names an oversized photo and still sends the ones that fit", () => {
    const small = file("small.jpg", MB);
    const result = checkPicked("pageImage", [small, file("IMG_0042.HEIC.jpg", 6.2 * MB)], 20);
    expect(result.accepted).toEqual([small]);
    expect(result.problem).toBe(
      "IMG_0042.HEIC.jpg is 6.2 MB, over the 4MB limit for a photo. Choose a smaller one."
    );
  });

  it("lists several oversized files at once", () => {
    const result = checkPicked("pageImage", [file("a.jpg", 5 * MB), file("b.jpg", 9 * MB)], 20);
    expect(result.accepted).toEqual([]);
    expect(result.problem).toBe("2 photos are over the 4MB limit and were not uploaded: a.jpg, b.jpg.");
  });

  it("accepts a file of exactly the limit, as UploadThing does", () => {
    expect(checkPicked("logo", [file("mark.png", MB)], 1).problem).toBeNull();
  });

  it("sends only what the field has room for and says so", () => {
    const picked = Array.from({ length: 5 }, (_, i) => file(`${i}.jpg`, MB));
    const result = checkPicked("pageImage", picked, 3);
    expect(result.accepted).toHaveLength(3);
    expect(result.problem).toBe("There is room for 3 more photos, so the last 2 were not uploaded.");
  });

  it("says a full field is full", () => {
    const result = checkPicked("pageImage", [file("a.jpg", MB)], 0);
    expect(result.accepted).toEqual([]);
    expect(result.problem).toBe("This page is full. Remove a photo to add another.");
  });
});

describe("batches", () => {
  it("splits a large pick into requests the endpoint accepts", () => {
    const picked = Array.from({ length: 15 }, (_, i) => i);
    const runs = batches(picked, UPLOAD_LIMITS.pageImage.maxFileCount);
    expect(runs.map((run) => run.length)).toEqual([10, 5]);
    expect(runs.flat()).toEqual(picked);
  });

  it("returns nothing for nothing", () => {
    expect(batches([], 10)).toEqual([]);
  });
});

describe("uploadRefusal", () => {
  it("turns UploadThing's size tag into a sentence with the limit", () => {
    expect(
      uploadRefusal(
        "Invalid config: FileSizeMismatch",
        "You uploaded a image/jpeg file that was 6.20MB, but the limit for that type is 4MB"
      )
    ).toBe("That file is over the 4MB limit. Choose a smaller one and try again.");
  });

  it("turns the count tag into a sentence", () => {
    expect(
      uploadRefusal(
        "Invalid config: FileCountMismatch",
        "You uploaded 11 file(s) of type 'image/jpeg', but the maximum for that type is 10"
      )
    ).toBe("Upload up to 10 at a time.");
  });

  it("never shows an internal tag, even with no cause", () => {
    for (const tag of ["FileSizeMismatch", "FileCountMismatch", "InvalidFileType"]) {
      expect(uploadRefusal(`Invalid config: ${tag}`, undefined)).not.toMatch(/Invalid config|Mismatch/);
    }
    expect(uploadRefusal("Failed to run middleware", undefined)).not.toMatch(/middleware/);
  });

  it("passes this app's own messages through", () => {
    expect(uploadRefusal("Sign in to upload a file.", undefined)).toBe("Sign in to upload a file.");
  });
});

describe("clientUploadMessage", () => {
  it("hides a raw XHR failure", () => {
    expect(clientUploadMessage({ code: "UPLOAD_FAILED", message: "XHR failed 0 " })).toMatch(
      /did not finish/
    );
  });

  it("keeps a message the server sent", () => {
    expect(clientUploadMessage({ code: "BAD_REQUEST", message: "Upload up to 10 at a time." })).toBe(
      "Upload up to 10 at a time."
    );
  });
});

describe("unsavedUploadMessage", () => {
  it("counts what was lost", () => {
    expect(unsavedUploadMessage(1, "photo")).toBe("A photo uploaded but could not be saved. Please try it again.");
    expect(unsavedUploadMessage(3, "photo")).toBe("3 photos uploaded but could not be saved. Please try them again.");
  });
});
