// The only code that touches object storage. Document images live in a
// private S3 bucket under opaque keys; Postgres holds the key. The browser
// never receives a bucket URL: pages stream through /api/documents/[id]/image,
// so the bucket needs no public access and no presigned URLs are issued.
//
// S3_ENDPOINT + S3_FORCE_PATH_STYLE point the same code at MinIO for offline
// development; nothing else differs.

import "server-only";

import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client, type PutObjectCommandInput } from "@aws-sdk/client-s3";

const g = globalThis as unknown as { __vdcS3?: S3Client };

function bucket(): string {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET is not set");
  return b;
}

export function s3(): S3Client {
  if (g.__vdcS3) return g.__vdcS3;
  const endpoint = process.env.S3_ENDPOINT || undefined;
  g.__vdcS3 = new S3Client({
    region: process.env.AWS_REGION ?? "ap-southeast-2",
    endpoint,
    forcePathStyle: Boolean(endpoint) || process.env.S3_FORCE_PATH_STYLE === "true",
  });
  return g.__vdcS3;
}

/** Keys carry ids only, never a filename or anything read from a document. */
export const pageKey = (caseId: string, uploadId: string, n: number) => `cases/${caseId}/uploads/${uploadId}/p${n}`;
export const imageKey = (caseId: string, docId: string) => `cases/${caseId}/documents/${docId}/image`;

function encryption(): Pick<PutObjectCommandInput, "ServerSideEncryption" | "SSEKMSKeyId"> {
  const kms = process.env.S3_KMS_KEY_ID;
  if (kms) return { ServerSideEncryption: "aws:kms", SSEKMSKeyId: kms };
  // MinIO refuses SSE headers unless it has a KMS; real S3 always accepts AES256.
  if (process.env.S3_ENDPOINT) return {};
  return { ServerSideEncryption: "AES256" };
}

export async function putObject(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: bytes, ContentType: contentType, ...encryption() }));
}

export async function getObject(key: string): Promise<Uint8Array> {
  const out = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!out.Body) throw new Error(`empty object ${key}`);
  return out.Body.transformToByteArray();
}

export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await s3().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }));
}
