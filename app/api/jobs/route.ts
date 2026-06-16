import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toJobDTO } from "@/lib/serialize";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api:jobs");

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const all = req.nextUrl.searchParams.get("all");

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId query param is required" },
      { status: 400 },
    );
  }

  try {
    if (all === "true") {
      const jobs = await db.listJobsByProject(projectId);
      return NextResponse.json({ jobs: jobs.map(toJobDTO) });
    }
    const job = await db.getLatestJobByProject(projectId);
    return NextResponse.json({ job: job ? toJobDTO(job) : null });
  } catch (err) {
    log.error("Failed to load jobs", err);
    return NextResponse.json({ error: "Failed to load jobs" }, { status: 500 });
  }
}
