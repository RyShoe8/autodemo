import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ListChecks, Film } from "lucide-react";
import { db } from "@/lib/db";
import { toProjectDTO, toProjectVideoDTO } from "@/lib/serialize";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { VideoStatusBadge } from "@/components/status/status-badge";
import { VideoGenerationPanel } from "@/components/projects/video-generation-panel";

export const dynamic = "force-dynamic";

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string; videoId: string }>;
}) {
  const { id, videoId } = await params;
  const projectRecord = await db.getProject(id);
  const videoRecord = await db.getVideo(videoId);
  if (!projectRecord || !videoRecord || videoRecord.projectId !== id) notFound();

  const project = toProjectDTO(projectRecord);
  const video = toProjectVideoDTO(videoRecord);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={video.name} description={project.name}>
        <VideoStatusBadge status={video.status} />
        <Button asChild variant="outline">
          <Link href={`/projects/${id}/videos/${videoId}/workflow`}>
            <ListChecks className="h-4 w-4" /> Workflow
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/projects/${id}/videos/${videoId}/assets`}>
            <Film className="h-4 w-4" /> Assets
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/projects/${id}`}>
            <ArrowLeft className="h-4 w-4" /> Project
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-6">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">Prompt</p>
          <p className="mt-1 text-sm">{video.prompt}</p>
        </div>
        <VideoGenerationPanel
          projectId={id}
          videoId={videoId}
          status={video.status}
        />
      </div>
    </div>
  );
}
