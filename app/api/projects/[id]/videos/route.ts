import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toProjectVideoDTO, toJobDTO } from "@/lib/serialize";
import {
  createProjectVideoSchema,
} from "@/lib/validation/schemas";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api:projects:videos");

const ACTIVE_JOB_STATUSES = [
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
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const project = await db.getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const videos = await db.listVideosByProject(id);
    return NextResponse.json({
      videos: videos.map(toProjectVideoDTO),
    });
  } catch (err) {
    log.error("Failed to list videos", err);
    return NextResponse.json({ error: "Failed to list videos" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createProjectVideoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  try {
    const project = await db.getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (!project.applicationMap) {
      return NextResponse.json(
        { error: "Run discovery on the project before creating a video" },
        { status: 400 },
      );
    }

    const video = await db.createVideo({
      projectId,
      name: parsed.data.name,
      prompt: parsed.data.prompt,
      voiceOption: parsed.data.voiceOption,
      platforms: parsed.data.platforms,
      status: "building_workflow",
    });

    const latest = await db.getLatestJobByVideo(video.id);
    if (
      latest &&
      ACTIVE_JOB_STATUSES.includes(latest.status as (typeof ACTIVE_JOB_STATUSES)[number])
    ) {
      return NextResponse.json(
        { error: "A job is already in progress for this video" },
        { status: 409 },
      );
    }

    const job = await db.createJob({
      projectId,
      videoId: video.id,
      type: "build_workflow",
    });

    log.info(`Created video ${video.id} and enqueued build_workflow ${job.id}`);
    return NextResponse.json(
      { video: toProjectVideoDTO(video), job: toJobDTO(job) },
      { status: 201 },
    );
  } catch (err) {
    log.error("Failed to create video", err);
    return NextResponse.json({ error: "Failed to create video" }, { status: 500 });
  }
}
