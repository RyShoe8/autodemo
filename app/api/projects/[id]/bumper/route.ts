import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { saveBuffer } from "@/lib/storage";
import { toProjectDTO } from "@/lib/serialize";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api:projects:bumper");

const ALLOWED_TYPES = new Set(["video/mp4", "video/webm"]);

const EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};

const MAX_SIZE = 100 * 1024 * 1024;

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
    const file = form.get("bumper");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing bumper file (field name: bumper)" },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Bumper must be 100 MB or smaller" },
        { status: 413 },
      );
    }

    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "Bumper must be MP4 or WebM" },
        { status: 415 },
      );
    }

    const ext = EXT_BY_TYPE[contentType] ?? "mp4";
    const buffer = Buffer.from(await file.arrayBuffer());
    const bumperUrl = await saveBuffer(
      `projects/${id}/bumper/bumper.${ext}`,
      buffer,
      contentType,
    );

    const updated = await db.updateProject(id, { bumperUrl });
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ project: toProjectDTO(updated), bumperUrl });
  } catch (err) {
    log.error("Bumper upload failed", err);
    return NextResponse.json({ error: "Bumper upload failed" }, { status: 500 });
  }
}
