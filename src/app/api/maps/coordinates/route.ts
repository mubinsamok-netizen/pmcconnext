import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

type CoordinateRequest = {
  project_id?: string;
  site_link?: string;
};

type Coordinates = {
  lat: number;
  lng: number;
};

const MAX_LINKS_PER_REQUEST = 40;
const RESOLVE_TIMEOUT_MS = 8000;

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isValidCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function extractCoordinatesFromMapLink(link?: string): Coordinates | null {
  const raw = String(link || "").trim();
  if (!raw) return null;

  const decoded = safeDecode(raw);
  const candidates = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?)(?:%2C|,|\s)+(-?\d+(?:\.\d+)?)/,
    /(?:^|[/?&=])(-?\d{1,2}\.\d{4,})(?:%2C|,|\s)+(-?\d{2,3}\.\d{4,})(?:$|[/?&#])/,
  ];

  for (const pattern of candidates) {
    const match = decoded.match(pattern) || raw.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (isValidCoordinate(lat, lng)) return { lat, lng };
  }

  return null;
}

function isLikelyMapsUrl(value: string) {
  return /^https?:\/\//i.test(value) && (
    value.includes("google.") ||
    value.includes("goo.gl") ||
    value.includes("maps.app.goo.gl")
  );
}

async function resolveMapLink(siteLink: string): Promise<Coordinates | null> {
  const direct = extractCoordinatesFromMapLink(siteLink);
  if (direct) return direct;
  if (!isLikelyMapsUrl(siteLink)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

  try {
    const response = await fetch(siteLink, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 PMC-CONNEXT Site Map",
      },
    });

    return extractCoordinatesFromMapLink(response.url);
  } catch (error) {
    console.warn("Failed to resolve Maps link:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const requestItems = Array.isArray(body.items) ? body.items : body.links;
  const links = Array.isArray(requestItems) ? requestItems.slice(0, MAX_LINKS_PER_REQUEST) as CoordinateRequest[] : [];

  const results = await Promise.all(links.map(async (item) => {
    const projectId = String(item.project_id || "").trim();
    const siteLink = String(item.site_link || "").trim();
    if (!projectId || !siteLink) return null;

    const coordinates = await resolveMapLink(siteLink);
    if (!coordinates) return { project_id: projectId, coordinates: null };
    return { project_id: projectId, coordinates };
  }));

  return NextResponse.json({
    success: true,
    data: results.filter(Boolean),
  });
}
