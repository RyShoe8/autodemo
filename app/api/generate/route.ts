import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { generateSchema } from "@/lib/validation/schemas";
import { toJobDTO } from "@/lib/serialize";
import { createLogger } from "@/lib/logger";
import type { JobStatus } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api:generate");

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

function isActive(status: JobStatus): boolean {
  return ACTIVE_JOB_STATUSES.includes(status);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { projectId, videoId, type } = parsed.data;

  try {
    const project = await db.getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (type === "build_workflow" || type === "produce") {
      if (!videoId) {
        return NextResponse.json(
          { error: "videoId is required for this job type" },
          { status: 400 },
        );
      }
      const video = await db.getVideo(videoId);
      if (!video || video.projectId !== projectId) {
        return NextResponse.json({ error: "Video not found" }, { status: 404 });
      }
      if (type === "produce" && (video.workflow ?? []).length === 0) {
        return NextResponse.json(
          { error: "Approve a workflow before recording" },
          { status: 400 },
        );
      }
      const latestVideoJob = await db.getLatestJobByVideo(videoId);
      if (latestVideoJob && isActive(latestVideoJob.status)) {
        return NextResponse.json(
          { error: "A job is already in progress for this video" },
          { status: 409 },
        );
      }
    }

    if (type === "discover" || type === "render_bumper") {
      const latestProjectJob = await db.getLatestJobByProject(projectId);
      if (latestProjectJob && isActive(latestProjectJob.status)) {
        return NextResponse.json(
          { error: "A job is already in progress for this project" },
          { status: 409 },
        );
      }
    }

    if (type === "discover") {
      await db.updateProject(projectId, { status: "discovering" });
    } else if (type === "render_bumper") {
      /* project status unchanged */
    } else if (videoId) {
      await db.updateVideo(videoId, {
        status: type === "build_workflow" ? "building_workflow" : "recording",
      });
    }

    const job = await db.createJob({ projectId, videoId, type });
    log.info(`Enqueued ${type} job ${job.id} for project ${projectId}`);

    return NextResponse.json({ job: toJobDTO(job) }, { status: 201 });
  } catch (err) {
    log.error("Failed to enqueue job", err);
    return NextResponse.json(
      { error: "Failed to start generation" },
      { status: 500 },
    );
  }
}
