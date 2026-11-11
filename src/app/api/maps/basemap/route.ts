import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // CARTO Basemaps keys are used by the browser tile client, not Workspace API tokens.
  // The project Basemaps key is the default; deployments may still override it.
  const key = process.env.CARTO_BASEMAP_API_KEY?.trim() || "cb1_56ny_1_1f810891e72d45f70f71b0c1";
  const tiles = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
  return Response.json({ tileUrl: key ? `${tiles}?key=${encodeURIComponent(key)}` : tiles }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
