const BANGKOK_TIME_ZONE = "Asia/Bangkok";
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function text(value?: string | number | null) {
  return String(value ?? "").trim();
}

export function isDateOnlyValue(value?: string | number | null) {
  return DATE_ONLY_PATTERN.test(text(value));
}

export function parseBangkokDate(value?: string | number | null) {
  const raw = text(value);
  if (!raw) return null;
  const normalized = isDateOnlyValue(raw) ? `${raw}T00:00:00+07:00` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatBangkokDate(value?: string | number | null) {
  const raw = text(value);
  if (!raw) return "-";
  const date = parseBangkokDate(raw);
  if (!date) return raw;
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: BANGKOK_TIME_ZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatBangkokDateTime(value?: string | number | null) {
  const raw = text(value);
  if (!raw) return "-";
  if (isDateOnlyValue(raw)) return formatBangkokDate(raw);

  const date = parseBangkokDate(raw);
  if (!date) return raw;
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: BANGKOK_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
