import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";

function getSigningSecret() {
  const secret = process.env.SCHEDULE_SHARE_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("SCHEDULE_SHARE_SECRET or NEXTAUTH_SECRET is not configured");
  return secret;
}

function signatureFor(projectId: string) {
  return createHmac("sha256", getSigningSecret())
    .update(`schedule-share:${TOKEN_VERSION}:${projectId}`)
    .digest("base64url");
}

export function createScheduleShareToken(projectId: string) {
  return `${TOKEN_VERSION}.${signatureFor(projectId)}`;
}

export function verifyScheduleShareToken(projectId: string, token: string) {
  const expected = createScheduleShareToken(projectId);
  const actualBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
