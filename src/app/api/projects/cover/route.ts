import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { canAccessProject } from "@/lib/authz";
import { readProjectCover } from "@/lib/uploadProjectCover";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response(null, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId") || "";
  const fileId = searchParams.get("fileId") || "";
  if (!projectId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(fileId)) {
    return new Response(null, { status: 400 });
  }

  try {
    if (!(await canAccessProject(projectId, session.user))) return new Response(null, { status: 403 });
    const image = await readProjectCover(projectId, fileId);
    if (!image.ok || !image.body) {
      return new Response(null, { status: image.status === 404 ? 404 : 502 });
    }
    return new Response(image.body, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
