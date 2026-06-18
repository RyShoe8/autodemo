import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { workflowSchema } from "@/lib/validation/schemas";
import { toProjectVideoDTO, toJobDTO } from "@/lib/serialize";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api:workflows");

const saveSchema = z.object({
  videoId: z.string().min(1),
  workflow: workflowSchema,
});

const actionSchema = z.object({
  videoId: z.string().min(1),
  action: z.enum(["approve", "regenerate"]),
  workflow: workflowSchema.optional(),
});

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const video = await db.updateVideo(parsed.data.videoId, {
    workflow: parsed.data.workflow,
  });
  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }
  return NextResponse.json({ video: toProjectVideoDTO(video) });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { videoId, action, workflow } = parsed.data;
  const video = await db.getVideo(videoId);
  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  if (workflow) {
    await db.updateVideo(videoId, { workflow });
  }

  try {
    if (action === "approve") {
      const current = workflow ?? video.workflow ?? [];
      if (current.filter((s) => s.enabled).length === 0) {
        return NextResponse.json(
          { error: "Enable at least one step before approving" },
          { status: 400 },
        );
      }
      await db.updateVideo(videoId, { status: "recording" });
      const job = await db.createJob({
        projectId: video.projectId,
        videoId,
        type: "produce",
      });
      log.info(`Approved workflow for video ${videoId}; produce job ${job.id}`);
      return NextResponse.json({ job: toJobDTO(job) }, { status: 201 });
    }

    await db.updateVideo(videoId, { status: "building_workflow" });
    const job = await db.createJob({
      projectId: video.projectId,
      videoId,
      type: "build_workflow",
    });
    log.info(`Regenerating workflow for video ${videoId}; job ${job.id}`);
    return NextResponse.json({ job: toJobDTO(job) }, { status: 201 });
  } catch (err) {
    log.error("Workflow action failed", err);
    return NextResponse.json(
      { error: "Failed to process workflow action" },
      { status: 500 },
    );
  }
}
