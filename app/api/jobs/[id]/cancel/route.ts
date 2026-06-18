import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toJobDTO } from "@/lib/serialize";
import { createLogger } from "@/lib/logger";
import {
  CANCELLED_BY_USER,
  isActiveJobStatus,
  isTerminalJobStatus,
} from "@/lib/workflow/job-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api:jobs:cancel");

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const job = await db.getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (isTerminalJobStatus(job.status)) {
      return NextResponse.json({ job: toJobDTO(job) });
    }

    if (!isActiveJobStatus(job.status)) {
      return NextResponse.json({ job: toJobDTO(job) });
    }

    const completedAt = new Date();
    const updated = await db.updateJob(id, {
      status: "failed",
      error: CANCELLED_BY_USER,
      completedAt,
    });
    if (!updated) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    await db.appendJobLog(
      id,
      `[${completedAt.toISOString()}] ${CANCELLED_BY_USER}.`,
    );

    if (job.videoId) {
      await db.updateVideo(job.videoId, { status: "failed" });
    } else {
      await db.updateProject(job.projectId, { status: "failed" });
    }

    const fresh = await db.getJob(id);
    log.info(`Cancelled job ${id}`);
    return NextResponse.json({ job: toJobDTO(fresh ?? updated) });
  } catch (err) {
    log.error("Failed to cancel job", err);
    return NextResponse.json({ error: "Failed to cancel job" }, { status: 500 });
  }
}
