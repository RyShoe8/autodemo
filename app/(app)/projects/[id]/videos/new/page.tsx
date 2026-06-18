import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { toProjectDTO } from "@/lib/serialize";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { CreateVideoForm } from "@/components/forms/create-video-form";

export const dynamic = "force-dynamic";

export default async function NewVideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await db.getProject(id);
  if (!record) notFound();
  const project = toProjectDTO(record);
  if (project.status !== "ready") notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New video" description={`Add a demo video to ${project.name}.`}>
        <Button asChild variant="outline">
          <Link href={`/projects/${id}`}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>
      </PageHeader>
      <CreateVideoForm projectId={id} />
    </div>
  );
}
