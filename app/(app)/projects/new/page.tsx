import { PageHeader } from "@/components/layout/page-header";
import { CreateProjectForm } from "@/components/forms/create-project-form";

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New project"
        description="Configure a new automated demo video."
      />
      <CreateProjectForm />
    </div>
  );
}
