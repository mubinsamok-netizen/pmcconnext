import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getSiteMapTileUrl } from "@/lib/siteMapBasemap";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  return Response.json({ tileUrl: getSiteMapTileUrl() }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
