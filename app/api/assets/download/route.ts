import { NextResponse, type NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth/session";
import { readAsset, contentTypeFromUrl } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Stream an asset back to the browser as an attachment with a friendly
 * filename. Accepts internal storage URLs or absolute (blob) URLs.
 */
export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.searchParams.get("url");
  const name =
    req.nextUrl.searchParams.get("name") || "autodemo-asset";

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const buffer = await readAsset(url);
    const contentType = contentTypeFromUrl(url);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "Download failed" }, { status: 502 });
  }
}
