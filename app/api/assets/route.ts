import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toAssetDTO } from "@/lib/serialize";
import { requireProject, requireVideo } from "@/lib/auth/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!projectId && !videoId) {
    return NextResponse.json(
      { error: "projectId or videoId query param is required" },
      { status: 400 },
    );
  }

  if (videoId) {
    const guard = await requireVideo(videoId);
    if (!guard.ok) return guard.response;
    const assets = await db.listAssetsByVideo(videoId);
    return NextResponse.json({ assets: assets.map(toAssetDTO) });
  }

  const guard = await requireProject(projectId!);
  if (!guard.ok) return guard.response;
  const assets = await db.listAssetsByProject(projectId!);
  return NextResponse.json({ assets: assets.map(toAssetDTO) });
}
