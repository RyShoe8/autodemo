import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toProjectVideoDTO } from "@/lib/serialize";
import { updateProjectVideoSchema } from "@/lib/validation/schemas";
import { createLogger } from "@/lib/logger";
import type { JobStatus } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api:projects:videos:id");

const ACTIVE_JOB_STATUSES: JobStatus[] = [
  "queued",
  "discovering",
  "building_workflow",
  "recording",
  "generating_script",
  "generating_audio",
  "rendering",
  "exporting",
];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; videoId: string }> },
) {
  const { id, videoId } = await params;
  try {
    const video = await db.getVideo(videoId);
    if (!video || video.projectId !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ video: toProjectVideoDTO(video) });
  } catch (err) {
    log.error("Failed to load video", err);
    return NextResponse.json({ error: "Failed to load video" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; videoId: string }> },
) {
  const { id, videoId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = updateProjectVideoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  try {
    const existing = await db.getVideo(videoId);
    if (!existing || existing.projectId !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const video = await db.updateVideo(videoId, parsed.data);
    if (!video) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ video: toProjectVideoDTO(video) });
  } catch (err) {
    log.error("Failed to update video", err);
    return NextResponse.json({ error: "Failed to update video" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; videoId: string }> },
) {
  const { id, videoId } = await params;
  try {
    const existing = await db.getVideo(videoId);
    if (!existing || existing.projectId !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const latestJob = await db.getLatestJobByVideo(videoId);
    if (latestJob && ACTIVE_JOB_STATUSES.includes(latestJob.status)) {
      return NextResponse.json(
        { error: "Cannot delete video while a job is in progress" },
        { status: 409 },
      );
    }

    await db.deleteVideo(videoId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("Failed to delete video", err);
    return NextResponse.json({ error: "Failed to delete video" }, { status: 500 });
  }
}
