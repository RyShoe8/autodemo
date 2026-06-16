import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { toProjectDTO } from "@/lib/serialize";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ProjectStatusBadge } from "@/components/status/status-badge";
import { AssetLibrary } from "@/components/assets/asset-library";

export const dynamic = "force-dynamic";

export default async function AssetsPage({
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
      <PageHeader
        title="Asset library"
        description={`Generated assets for "${project.name}".`}
      >
        <ProjectStatusBadge status={project.status} />
        <Button asChild variant="outline">
          <Link href={`/projects/${id}`}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>
      </PageHeader>

      <AssetLibrary projectId={id} />
    </div>
  );
}
