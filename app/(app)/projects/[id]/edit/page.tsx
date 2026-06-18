import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { toProjectDTO } from "@/lib/serialize";
import { PageHeader } from "@/components/layout/page-header";
import { EditProjectForm } from "@/components/forms/edit-project-form";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await db.getProject(id);
  if (!record) notFound();
  const project = toProjectDTO(record);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Edit project"
        description={`Update settings for ${project.name}.`}
      />
      <EditProjectForm project={project} />
    </div>
  );
}
