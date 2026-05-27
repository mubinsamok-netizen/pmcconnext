type SupabaseReadScope = "projects" | "auth" | "admin" | "site";
type SupabaseRestOptions = {
  schema?: string;
};

function normalizeUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function isEnabled(value?: string) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

export function isSupabaseBackend() {
  return String(process.env.DATA_BACKEND || "sheets").trim().toLowerCase() === "supabase";
}

export function isSupabaseReadEnabled(scope: SupabaseReadScope) {
  if (!isSupabaseBackend()) return false;
  if (scope === "projects") return true;
  if (scope === "auth") return true;
  if (scope === "admin") return isEnabled(process.env.SUPABASE_EXPERIMENTAL_ADMIN_READS);
  return isEnabled(process.env.SUPABASE_EXPERIMENTAL_SITE_READS);
}

export function shouldFallbackToSheets() {
  return String(process.env.DATA_BACKEND_FALLBACK || "sheets").trim().toLowerCase() !== "none";
}

export async function readWithSheetsFallback<T>(
  label: string,
  readSupabase: () => Promise<T>,
  readSheets: () => Promise<T>
) {
  try {
    return await readSupabase();
  } catch (error) {
    if (!shouldFallbackToSheets()) {
      throw error;
    }

    console.warn(`Supabase ${label} read failed. Falling back to Google Sheets.`, error);
    return await readSheets();
  }
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !key) {
    throw new Error("Supabase is enabled but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
  }

  return {
    url: normalizeUrl(url),
    key,
  };
}

function withSchemaHeaders(headers: Record<string, string>, options: SupabaseRestOptions = {}) {
  const schema = String(options.schema || "").trim();
  if (!schema) return headers;
  return {
    ...headers,
    "Accept-Profile": schema,
    "Content-Profile": schema,
  };
}

export async function supabaseSelect<T>(
  table: string,
  params: Record<string, string> = {},
  options: SupabaseRestOptions = {}
) {
  const { url, key } = getSupabaseConfig();
  const query = new URLSearchParams({
    select: "*",
    ...params,
  });

  const response = await fetch(`${url}/rest/v1/${table}?${query.toString()}`, {
    headers: withSchemaHeaders({
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    }, options),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase read failed for ${table}: ${response.status} ${detail}`);
  }

  return await response.json() as T[];
}

async function supabaseWrite<T>(
  table: string,
  init: {
    method: "POST" | "PATCH" | "DELETE";
    params?: Record<string, string>;
    body?: Record<string, unknown>;
  },
  options: SupabaseRestOptions = {}
) {
  const { url, key } = getSupabaseConfig();
  const query = new URLSearchParams(init.params || {});
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const response = await fetch(`${url}/rest/v1/${table}${suffix}`, {
    method: init.method,
    headers: withSchemaHeaders({
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: "return=representation",
    }, options),
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase ${init.method} failed for ${table}: ${response.status} ${detail}`);
  }

  if (response.status === 204) return [] as T[];
  return await response.json() as T[];
}

export async function supabaseInsert<T>(
  table: string,
  body: Record<string, unknown>,
  options: SupabaseRestOptions = {}
) {
  return supabaseWrite<T>(table, {
    method: "POST",
    body,
  }, options);
}

export async function supabasePatch<T>(
  table: string,
  keyColumn: string,
  keyValue: string,
  body: Record<string, unknown>,
  options: SupabaseRestOptions = {}
) {
  return supabaseWrite<T>(table, {
    method: "PATCH",
    params: { [keyColumn]: `eq.${keyValue}` },
    body,
  }, options);
}

export async function supabaseDelete<T>(
  table: string,
  keyColumn: string,
  keyValue: string,
  options: SupabaseRestOptions = {}
) {
  return supabaseWrite<T>(table, {
    method: "DELETE",
    params: { [keyColumn]: `eq.${keyValue}` },
  }, options);
}

export async function supabaseRpc<T>(
  functionName: string,
  body: Record<string, unknown> = {},
  options: SupabaseRestOptions = {}
) {
  const { url, key } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: withSchemaHeaders({
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    }, options),
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase RPC failed for ${functionName}: ${response.status} ${detail}`);
  }

  if (response.status === 204) return null as T;
  return await response.json() as T;
}
