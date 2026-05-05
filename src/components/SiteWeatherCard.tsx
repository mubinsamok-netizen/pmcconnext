import { CloudRain, CloudSun, Droplets, MapPin, Wind } from "lucide-react";
import type { SiteWeather } from "@/lib/siteWeather";

function formatMetric(value: number | null, suffix: string, fallback = "-") {
  return value === null ? fallback : `${value}${suffix}`;
}

function formatUpdatedAt(value: string) {
  if (!value) return "รอข้อมูลล่าสุด";
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

export default function SiteWeatherCard({ weather }: { weather: SiteWeather }) {
  const isFallback = weather.source === "fallback";

  return (
    <div className="relative min-h-[184px] overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,#243766_0%,#315b86_48%,#e66f2c_140%)] p-5 text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_8%,rgba(255,255,255,0.36),transparent_26%),radial-gradient(circle_at_10%_100%,rgba(251,146,60,0.38),transparent_30%)]" />
      <CloudSun className="absolute -right-3 -top-5 h-32 w-32 text-white/30" strokeWidth={1.4} />

      <div className="relative z-10 flex h-full min-h-[144px] flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-white/65">
              <MapPin size={14} />
              <span className="truncate">{weather.locationLabel}</span>
            </div>
            <p className="mt-2 text-sm font-bold text-white/80">{weather.condition}</p>
          </div>
          <span className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold text-white/80 ring-1 ring-white/15">
            Site Weather
          </span>
        </div>

        <div>
          <div className="flex items-end justify-between gap-4">
            <div className="text-[52px] font-extrabold leading-none tracking-normal">
              {formatMetric(weather.temperature, "°")}
            </div>
            <div className="pb-1 text-right text-xs font-bold text-white/65">
              <p>รู้สึกเหมือน {formatMetric(weather.feelsLike, "°")}</p>
              <p>อัปเดต {formatUpdatedAt(weather.updatedAt)}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-bold">
            <div className="rounded-xl bg-white/12 px-3 py-2 ring-1 ring-white/10">
              <div className="flex items-center gap-1.5 text-white/60">
                <Droplets size={14} />
                ชื้น
              </div>
              <p className="mt-1 text-sm text-white">{formatMetric(weather.humidity, "%")}</p>
            </div>
            <div className="rounded-xl bg-white/12 px-3 py-2 ring-1 ring-white/10">
              <div className="flex items-center gap-1.5 text-white/60">
                <CloudRain size={14} />
                ฝน
              </div>
              <p className="mt-1 text-sm text-white">{formatMetric(weather.rain, " มม.")}</p>
            </div>
            <div className="rounded-xl bg-white/12 px-3 py-2 ring-1 ring-white/10">
              <div className="flex items-center gap-1.5 text-white/60">
                <Wind size={14} />
                ลม
              </div>
              <p className="mt-1 text-sm text-white">{formatMetric(weather.windSpeed, " กม./ชม.")}</p>
            </div>
          </div>
        </div>

        {(weather.error || isFallback) && (
          <p className="relative z-10 mt-3 text-xs font-semibold text-white/58">
            {weather.error || "ใช้ข้อมูลตำแหน่งสำรอง"}
          </p>
        )}
      </div>
    </div>
  );
}
