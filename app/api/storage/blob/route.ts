import { NextResponse, type NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth/session";
import { readAsset, contentTypeFromUrl } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Authenticated proxy for private Vercel Blob assets.
 * Browsers cannot fetch private blob URLs directly; this route reads via the SDK.
 */
export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const buffer = await readAsset(url);
    const contentType = contentTypeFromUrl(url);
    const download = req.nextUrl.searchParams.get("download") === "1";
    const name =
      req.nextUrl.searchParams.get("name")?.replace(/"/g, "") ?? "asset";

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, max-age=3600",
    };
    if (download) {
      headers["Content-Disposition"] = `attachment; filename="${name}"`;
    }

    return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "Blob read failed" }, { status: 502 });
  }
}
