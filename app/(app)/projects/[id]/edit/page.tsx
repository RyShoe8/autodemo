import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePageProject } from "@/lib/auth/page-guard";
import { toProjectDTO } from "@/lib/serialize";
import { PageHeader } from "@/components/layout/page-header";
import { EditProjectForm } from "@/components/forms/edit-project-form";
import { SessionImportCard } from "@/components/projects/session-import-card";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { project: record } = await requirePageProject(id);
  const project = toProjectDTO(record);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Edit project"
        description={`Update settings for ${project.name}.`}
      />
      <div className="space-y-6">
        <EditProjectForm project={project} />
        <SessionImportCard project={project} />
      </div>
    </div>
  );
}
