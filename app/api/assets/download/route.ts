import { NextResponse, type NextRequest } from "next/server";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

const LOCAL_PREFIX = "/api/storage/";

/**
 * Stream an asset back to the browser as an attachment with a friendly
 * filename. Accepts internal storage URLs or absolute (blob) URLs.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const name =
    req.nextUrl.searchParams.get("name") || "autodemo-asset";

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    let buffer: Buffer;
    let contentType = "application/octet-stream";

    if (url.startsWith(LOCAL_PREFIX)) {
      const key = url.slice(LOCAL_PREFIX.length);
      buffer = await storage.read(key);
    } else if (url.startsWith("http://") || url.startsWith("https://")) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Upstream ${res.status}`);
      buffer = Buffer.from(await res.arrayBuffer());
      contentType = res.headers.get("content-type") ?? contentType;
    } else {
      return NextResponse.json({ error: "Unsupported URL" }, { status: 400 });
    }

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
