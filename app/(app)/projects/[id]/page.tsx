import { notFound } from "next/navigation";
import Link from "next/link";
import { Film, ListChecks, Pencil } from "lucide-react";
import { db } from "@/lib/db";
import { toProjectDTO } from "@/lib/serialize";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ProjectStatusBadge } from "@/components/status/status-badge";
import { ProjectInfo } from "@/components/projects/project-info";
import { WorkflowSummary } from "@/components/workflow/workflow-summary";
import { GenerationPanel } from "@/components/projects/generation-panel";

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

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={project.name} description={project.url}>
        <ProjectStatusBadge status={project.status} />
        <Button asChild variant="outline">
          <Link href={`/projects/${id}/edit`}>
            <Pencil className="h-4 w-4" /> Edit
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/projects/${id}/workflow`}>
            <ListChecks className="h-4 w-4" /> Workflow
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/projects/${id}/assets`}>
            <Film className="h-4 w-4" /> Assets
          </Link>
        </Button>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <ProjectInfo project={project} />
          <WorkflowSummary projectId={id} workflow={project.workflow} />
        </div>
        <div className="space-y-6">
          <GenerationPanel projectId={id} />
        </div>
      </div>
    </div>
  );
}
