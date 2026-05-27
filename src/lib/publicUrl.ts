function text(value: unknown) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function withProtocol(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("localhost") || value.startsWith("127.0.0.1")) return `http://${value}`;
  return `https://${value}`;
}

function normalizePublicOrigin(value: unknown) {
  const raw = text(value);
  if (!raw) return "";

  try {
    const url = new URL(withProtocol(raw));
    if (["vercel.com", "www.vercel.com"].includes(url.hostname.toLowerCase())) return "";
    return url.origin.replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function getPublicAppOrigin(input: { request?: Request; origin?: unknown } = {}) {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.NEXTAUTH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    input.origin,
    input.request?.headers.get("origin"),
    input.request ? new URL(input.request.url).origin : "",
  ];

  for (const candidate of candidates) {
    const origin = normalizePublicOrigin(candidate);
    if (origin) return origin;
  }

  return "";
}
