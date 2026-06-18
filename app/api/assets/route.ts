import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toAssetDTO } from "@/lib/serialize";

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
  const assets = videoId
    ? await db.listAssetsByVideo(videoId)
    : await db.listAssetsByProject(projectId!);
  return NextResponse.json({ assets: assets.map(toAssetDTO) });
}
