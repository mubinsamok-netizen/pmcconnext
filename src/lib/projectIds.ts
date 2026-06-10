export function normalizeProjectId(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^[\s"'`[\]\\]+/, "")
    .replace(/[\s"'`\]\\]+$/, "")
    .trim();
}

export function parseProjectIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  const ids = new Set<string>();

  for (const item of values) {
    if (Array.isArray(item)) {
      parseProjectIds(item).forEach((projectId) => ids.add(projectId));
      continue;
    }

    const raw = String(item ?? "").trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parseProjectIds(parsed).forEach((projectId) => ids.add(projectId));
        continue;
      }
    } catch {
      // Fall through for legacy malformed values such as ["PMC-2026-04\"].
    }

    raw
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map(normalizeProjectId)
      .filter(Boolean)
      .forEach((projectId) => ids.add(projectId));
  }

  return Array.from(ids);
}

export function serializeProjectIds(value: unknown) {
  return parseProjectIds(value).join(",");
}
