import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toAssetDTO } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json(
      { error: "projectId query param is required" },
      { status: 400 },
    );
  }
  const assets = await db.listAssetsByProject(projectId);
  return NextResponse.json({ assets: assets.map(toAssetDTO) });
}
