import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, required } from "@/lib/env";

/**
 * Neon Object Storage: S3-compatible, and it branches with the database, so a
 * preview branch gets its own copy of both the rows and the files they point at.
 *
 * Used for client logos composited into QR images. The bucket is declared in
 * neon.ts as `assets` with private access -- logos are a client's property, and
 * nothing here needs anonymous reads: the server reads the object when it
 * generates the QR.
 *
 * Path-style addressing and SigV4 only.
 */
let client: S3Client | null | undefined;

export function storage(): S3Client | null {
  if (client !== undefined) return client;

  const {
    AWS_ACCESS_KEY_ID: accessKeyId,
    AWS_SECRET_ACCESS_KEY: secretAccessKey,
    AWS_ENDPOINT_URL_S3: endpoint,
    AWS_REGION: region,
  } = env();

  if (!accessKeyId || !secretAccessKey || !endpoint || !region) {
    client = null;
    if (env().NODE_ENV !== "test") {
      console.warn("[storage] credentials absent; logo upload disabled");
    }
    return client;
  }

  client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    // Neon's endpoint is path-style, not virtual-host-style.
    forcePathStyle: true,
  });
  return client;
}

function bucket(): string {
  return env().QR_BUCKET;
}

/** Allowed logo types. SVG is excluded: it can carry script. */
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 1_024 * 1_024; // 1 MB

export type UploadTarget = { key: string; url: string };

/**
 * A presigned PUT the browser uploads straight to, so a 1 MB image never
 * travels through the application server.
 *
 * Each upload gets a fresh key rather than overwriting: a cached object is only
 * as fresh as its key, and the row in `qr_codes.logo_key` is repointed instead.
 */
export async function createLogoUploadUrl(options: {
  userId: string;
  contentType: string;
  byteLength: number;
}): Promise<UploadTarget> {
  if (!ALLOWED_TYPES.has(options.contentType)) {
    throw new Error("Logos must be PNG, JPEG or WebP.");
  }
  if (options.byteLength > MAX_BYTES) {
    throw new Error("Logos must be under 1 MB.");
  }

  const s3 = storage();
  if (!s3) throw new Error("Object storage is not configured.");

  const extension = options.contentType.split("/")[1].replace("jpeg", "jpg");
  const key = `qr-logos/${options.userId}/${crypto.randomUUID()}.${extension}`;

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: options.contentType,
      ContentLength: options.byteLength,
    }),
    { expiresIn: 300 } // 5 minutes
  );

  return { key, url };
}

/** Short-lived read URL, for showing a client their own logo back. */
export async function createLogoReadUrl(key: string): Promise<string> {
  const s3 = storage();
  if (!s3) throw new Error("Object storage is not configured.");

  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: 300,
  });
}

/** Read the bytes server-side, to composite into a generated QR image. */
export async function readObject(key: string): Promise<Buffer> {
  const s3 = storage();
  if (!s3) throw new Error("Object storage is not configured.");

  const result = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const bytes = await result.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Object ${key} has no body.`);
  return Buffer.from(bytes);
}

export async function putObject(options: {
  key: string;
  body: Buffer | string;
  contentType: string;
}): Promise<void> {
  const s3 = storage();
  if (!s3) throw new Error("Object storage is not configured.");

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: options.key,
      Body: options.body,
      ContentType: options.contentType,
    })
  );
}

export async function objectExists(key: string): Promise<boolean> {
  const s3 = storage();
  if (!s3) return false;

  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** Called when a code's logo is replaced, or an account is deleted. */
export async function deleteObject(key: string): Promise<void> {
  const s3 = storage();
  if (!s3) return;

  await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Reported by /health. */
export function storageConfigured(): boolean {
  return storage() !== null;
}

/** Throws with the variable name when storage is required but unset. */
export function requireStorageEndpoint(): string {
  return required("AWS_ENDPOINT_URL_S3");
}
