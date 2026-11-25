import { getSiteMapTileUrl } from "@/lib/siteMapBasemap";
import SiteMapWorkspace from "./SiteMapWorkspace";

export default function SiteMapPage() {
  return <SiteMapWorkspace tileUrl={getSiteMapTileUrl()} />;
}
