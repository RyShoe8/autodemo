import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ProjectsTable } from "@/components/projects/projects-table";

export const dynamic = "force-dynamic";

export default function ProjectsPage() {
  return (
    <div>
      <PageHeader
        title="Projects"
        description="All demo video projects."
      >
        <Button asChild>
          <Link href="/projects/new">
            <Plus className="h-4 w-4" /> New project
          </Link>
        </Button>
      </PageHeader>
      <ProjectsTable />
    </div>
  );
}
