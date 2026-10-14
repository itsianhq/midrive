import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/env";

const baseConfig: S3ClientConfig = {
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
  // Many S3-compatible providers reject the SDK's default CRC checksums,
  // and they would otherwise be baked into presigned upload URLs.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
};

/** Client for server-side calls. */
const s3 = new S3Client({ ...baseConfig, endpoint: env.S3_ENDPOINT });

/** Client used only for signing URLs that the browser will hit. */
const signer = env.S3_PUBLIC_ENDPOINT
  ? new S3Client({ ...baseConfig, endpoint: env.S3_PUBLIC_ENDPOINT })
  : s3;

const Bucket = env.S3_BUCKET;

const UPLOAD_URL_TTL = 60 * 60 * 6; // 6h, large multipart uploads can be slow
const DOWNLOAD_URL_TTL = 60 * 15;

/** Files above this size are uploaded with multipart. */
export const MULTIPART_THRESHOLD = 64 * 1024 * 1024;
const MIN_PART_SIZE = 16 * 1024 * 1024;
const MAX_PARTS = 10_000;

export function objectKey(ownerId: string, nodeId: string) {
  return `files/${ownerId}/${nodeId}`;
}

export function thumbnailKey(ownerId: string, nodeId: string) {
  return `thumbnails/${ownerId}/${nodeId}.webp`;
}

/** Content-Length is signed, so the storage provider rejects a body of any other size. */
export function presignPut(key: string, contentType: string, size: number) {
  return getSignedUrl(
    signer,
    new PutObjectCommand({ Bucket, Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: UPLOAD_URL_TTL },
  );
}

export function presignGet(
  key: string,
  opts: { filename?: string; disposition?: "inline" | "attachment"; contentType?: string | null } = {},
) {
  const disposition = opts.disposition ?? "inline";
  const filename = opts.filename;
  return getSignedUrl(
    signer,
    new GetObjectCommand({
      Bucket,
      Key: key,
      ResponseContentDisposition: filename
        ? `${disposition}; filename="${asciiFilename(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
        : disposition,
      ResponseContentType: opts.contentType ?? undefined,
    }),
    { expiresIn: DOWNLOAD_URL_TTL },
  );
}

function asciiFilename(name: string) {
  return name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
}

export function partSizeFor(size: number) {
  const mb = 1024 * 1024;
  const needed = Math.ceil(size / MAX_PARTS);
  return Math.max(MIN_PART_SIZE, Math.ceil(needed / mb) * mb);
}

export async function createMultipart(key: string, contentType: string, size: number) {
  const res = await s3.send(new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType }));
  if (!res.UploadId) throw new Error("S3 did not return an UploadId");
  const partSize = partSizeFor(size);
  const partCount = Math.max(1, Math.ceil(size / partSize));
  const parts = await Promise.all(
    Array.from({ length: partCount }, async (_, i) => ({
      partNumber: i + 1,
      // Signed per part so the parts can't add up to more than `size`
      url: await getSignedUrl(
        signer,
        new UploadPartCommand({
          Bucket,
          Key: key,
          UploadId: res.UploadId,
          PartNumber: i + 1,
          ContentLength: Math.min(partSize, size - i * partSize),
        }),
        { expiresIn: UPLOAD_URL_TTL },
      ),
    })),
  );
  return { uploadId: res.UploadId, partSize, parts };
}

export async function completeMultipart(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
) {
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: [...parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
}

export async function abortMultipart(key: string, uploadId: string) {
  await s3.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId })).catch(() => {});
}

/** Returns the object size, or null if it does not exist. */
export async function headObject(key: string) {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
    return { size: res.ContentLength ?? 0 };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || (err as Error).name === "NotFound") return null;
    throw err;
  }
}

/** Deletes objects one by one: DeleteObjects needs checksums some providers reject. */
export async function deleteObjects(keys: (string | null | undefined)[]) {
  const list = keys.filter((k): k is string => !!k);
  const CONCURRENCY = 16;
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    await Promise.all(
      list.slice(i, i + CONCURRENCY).map((Key) => s3.send(new DeleteObjectCommand({ Bucket, Key }))),
    );
  }
}
