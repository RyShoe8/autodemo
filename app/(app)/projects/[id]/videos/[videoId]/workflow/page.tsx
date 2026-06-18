import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { toProjectDTO, toProjectVideoDTO } from "@/lib/serialize";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { VideoStatusBadge } from "@/components/status/status-badge";
import { WorkflowEditor } from "@/components/workflow/workflow-editor";

export const dynamic = "force-dynamic";

export default async function VideoWorkflowPage({
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
      <PageHeader
        title="Workflow review"
        description={`Review and approve the sequence for "${video.name}".`}
      >
        <VideoStatusBadge status={video.status} />
        <Button asChild variant="outline">
          <Link href={`/projects/${id}/videos/${videoId}`}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>
      </PageHeader>

      <WorkflowEditor
        projectId={id}
        videoId={videoId}
        initialWorkflow={video.workflow}
        bumperEnabled={project.bumperEnabled}
      />
    </div>
  );
}
