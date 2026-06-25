import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { db } from "@/lib/db";
import { toProjectDTO, toProjectVideoDTO } from "@/lib/serialize";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ProjectStatusBadge } from "@/components/status/status-badge";
import { ProjectInfo } from "@/components/projects/project-info";
import { ProjectBumperPanel } from "@/components/projects/project-bumper-panel";
import { ProjectDiscoveryPanel } from "@/components/projects/project-discovery-panel";
import { VideoList } from "@/components/projects/video-list";
import { ProjectCatalogPanel } from "@/components/projects/project-catalog-panel";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await db.getProject(id);
  if (!record) notFound();
  const project = toProjectDTO(record);
  const videos = (await db.listVideosByProject(id)).map(toProjectVideoDTO);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={project.name} description={project.url}>
        <ProjectStatusBadge status={project.status} />
        <Button asChild variant="outline">
          <Link href={`/projects/${id}/edit`}>
            <Pencil className="h-4 w-4" /> Edit
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <ProjectInfo project={project} />
          <ProjectBumperPanel
            projectId={id}
            initialBumperUrl={project.bumperUrl}
          />
          <VideoList
            projectId={id}
            videos={videos}
            canCreate={project.status === "ready"}
          />
        </div>
        <div className="space-y-6">
          <ProjectDiscoveryPanel projectId={id} status={project.status} />
          <ProjectCatalogPanel applicationMap={record.applicationMap} />
        </div>
      </div>
    </div>
  );
}
