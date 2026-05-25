type SupabaseReadScope = "projects" | "auth" | "admin" | "site";

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

export async function supabaseSelect<T>(table: string, params: Record<string, string> = {}) {
  const { url, key } = getSupabaseConfig();
  const query = new URLSearchParams({
    select: "*",
    ...params,
  });

  const response = await fetch(`${url}/rest/v1/${table}?${query.toString()}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
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
  }
) {
  const { url, key } = getSupabaseConfig();
  const query = new URLSearchParams(init.params || {});
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const response = await fetch(`${url}/rest/v1/${table}${suffix}`, {
    method: init.method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
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

export async function supabaseInsert<T>(table: string, body: Record<string, unknown>) {
  return supabaseWrite<T>(table, {
    method: "POST",
    body,
  });
}

export async function supabasePatch<T>(
  table: string,
  keyColumn: string,
  keyValue: string,
  body: Record<string, unknown>
) {
  return supabaseWrite<T>(table, {
    method: "PATCH",
    params: { [keyColumn]: `eq.${keyValue}` },
    body,
  });
}

export async function supabaseDelete<T>(table: string, keyColumn: string, keyValue: string) {
  return supabaseWrite<T>(table, {
    method: "DELETE",
    params: { [keyColumn]: `eq.${keyValue}` },
  });
}
