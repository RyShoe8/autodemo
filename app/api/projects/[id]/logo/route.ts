import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { saveBuffer } from "@/lib/storage";
import { toProjectDTO } from "@/lib/serialize";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api:projects:logo");

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const project = await db.getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const form = await req.formData();
    const file = form.get("logo");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing logo file (field name: logo)" },
        { status: 400 },
      );
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Logo must be 2 MB or smaller" },
        { status: 413 },
      );
    }

    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "Logo must be PNG, JPEG, WebP, SVG, or ICO" },
        { status: 415 },
      );
    }

    const ext = EXT_BY_TYPE[contentType] ?? "png";
    const buffer = Buffer.from(await file.arrayBuffer());
    const logoUrl = await saveBuffer(
      `projects/${id}/logo.${ext}`,
      buffer,
      contentType,
    );

    const updated = await db.updateProject(id, { logoUrl });
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ project: toProjectDTO(updated), logoUrl });
  } catch (err) {
    log.error("Logo upload failed", err);
    return NextResponse.json({ error: "Logo upload failed" }, { status: 500 });
  }
}
