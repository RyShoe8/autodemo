import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { toProjectDTO } from "@/lib/serialize";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ProjectStatusBadge } from "@/components/status/status-badge";
import { WorkflowEditor } from "@/components/workflow/workflow-editor";

export const dynamic = "force-dynamic";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await db.getProject(id);
  if (!record) notFound();
  const project = toProjectDTO(record);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Workflow review"
        description={`Review and approve the proposed sequence for "${project.name}".`}
      >
        <ProjectStatusBadge status={project.status} />
        <Button asChild variant="outline">
          <Link href={`/projects/${id}`}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>
      </PageHeader>

      <WorkflowEditor
        projectId={id}
        initialWorkflow={project.workflow}
        bumperEnabled={project.bumperEnabled}
      />
    </div>
  );
}
