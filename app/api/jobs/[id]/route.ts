import { NextResponse, type NextRequest } from "next/server";
import { toJobDTO } from "@/lib/serialize";
import { requireJob } from "@/lib/auth/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await requireJob(id);
  if (!guard.ok) return guard.response;
  return NextResponse.json({ job: toJobDTO(guard.value.job) });
}
