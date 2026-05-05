import type { MasterProject } from "@/lib/masterProjects";

type Coordinates = {
  latitude: number;
  longitude: number;
  label: string;
};

type OpenMeteoGeocodingResponse = {
  results?: Array<{
    name?: string;
    latitude?: number;
    longitude?: number;
    admin1?: string;
    country?: string;
  }>;
};

type OpenMeteoForecastResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    rain?: number;
    weather_code?: number;
    cloud_cover?: number;
    wind_speed_10m?: number;
  };
};

export type SiteWeather = {
  locationLabel: string;
  temperature: number | null;
  feelsLike: number | null;
  humidity: number | null;
  rain: number | null;
  windSpeed: number | null;
  cloudCover: number | null;
  condition: string;
  updatedAt: string;
  source: "site_link" | "geocoding" | "fallback";
  error?: string;
};

const BANGKOK_COORDINATES: Coordinates = {
  latitude: 13.7563,
  longitude: 100.5018,
  label: "Bangkok",
};

function parseNumber(value?: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getCoordinatesFromSiteLink(siteLink?: string): Coordinates | null {
  if (!siteLink) return null;

  const decoded = decodeURIComponent(siteLink);
  const atMatch = decoded.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  const bangMatch = decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const queryMatch = decoded.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  const match = atMatch || bangMatch || queryMatch;

  if (!match) return null;

  const latitude = parseNumber(match[1]);
  const longitude = parseNumber(match[2]);
  if (latitude === null || longitude === null) return null;

  return {
    latitude,
    longitude,
    label: "Site location",
  };
}

function getSearchQuery(project: MasterProject) {
  return [project.district, project.province, project.address]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(", ");
}

async function geocodeProject(project: MasterProject): Promise<Coordinates | null> {
  const query = getSearchQuery(project);
  if (!query) return null;

  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=th&format=json`,
    { next: { revalidate: 60 * 60 * 24 } },
  );

  if (!response.ok) return null;

  const data = (await response.json()) as OpenMeteoGeocodingResponse;
  const result = data.results?.[0];
  if (typeof result?.latitude !== "number" || typeof result.longitude !== "number") return null;

  const label = [result.name, result.admin1, result.country].filter(Boolean).join(", ");
  return {
    latitude: result.latitude,
    longitude: result.longitude,
    label: label || query,
  };
}

function getWeatherCondition(code?: number) {
  if (code === undefined) return "Weather unavailable";
  if (code === 0) return "Clear";
  if ([1, 2].includes(code)) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Mixed weather";
}

function roundMetric(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

export async function getSiteWeather(project: MasterProject): Promise<SiteWeather> {
  const fallback: SiteWeather = {
    locationLabel: project.province || project.address || "Site location",
    temperature: null,
    feelsLike: null,
    humidity: null,
    rain: null,
    windSpeed: null,
    cloudCover: null,
    condition: "Add site location",
    updatedAt: "",
    source: "fallback",
  };

  try {
    const linkCoordinates = getCoordinatesFromSiteLink(project.site_link);
    const coordinates = linkCoordinates || (await geocodeProject(project)) || BANGKOK_COORDINATES;
    const source = linkCoordinates ? "site_link" : coordinates === BANGKOK_COORDINATES ? "fallback" : "geocoding";

    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.searchParams.set("latitude", String(coordinates.latitude));
    forecastUrl.searchParams.set("longitude", String(coordinates.longitude));
    forecastUrl.searchParams.set(
      "current",
      "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,cloud_cover,wind_speed_10m",
    );
    forecastUrl.searchParams.set("timezone", "Asia/Bangkok");

    const response = await fetch(forecastUrl, { next: { revalidate: 30 * 60 } });
    if (!response.ok) {
      return { ...fallback, error: "Weather API unavailable" };
    }

    const data = (await response.json()) as OpenMeteoForecastResponse;
    const current = data.current;
    if (!current) {
      return { ...fallback, error: "Weather data unavailable" };
    }

    return {
      locationLabel: source === "fallback" ? fallback.locationLabel : coordinates.label,
      temperature: roundMetric(current.temperature_2m),
      feelsLike: roundMetric(current.apparent_temperature),
      humidity: roundMetric(current.relative_humidity_2m),
      rain: roundMetric(current.rain ?? current.precipitation),
      windSpeed: roundMetric(current.wind_speed_10m),
      cloudCover: roundMetric(current.cloud_cover),
      condition: getWeatherCondition(current.weather_code),
      updatedAt: current.time || "",
      source,
      error: source === "fallback" ? "Using Bangkok until the site location is more precise" : undefined,
    };
  } catch (error) {
    return {
      ...fallback,
      error: error instanceof Error ? error.message : "Weather data unavailable",
    };
  }
}
