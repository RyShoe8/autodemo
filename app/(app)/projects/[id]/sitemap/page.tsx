import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { SitemapClient } from "./client";

export const dynamic = "force-dynamic";

export default async function SitemapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await db.getProject(id);
  if (!project) notFound();

  const applicationMap = project.applicationMap;

  if (!applicationMap || !applicationMap.pages || applicationMap.pages.length === 0) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title={`${project.name} Site Web Map`} description="No application map discovered yet." />
        <Button asChild variant="outline" className="mb-4">
          <Link href={`/projects/${id}`}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Project
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <PageHeader title={`${project.name} Site Web Map`} description="Visual representation of the discovered application pages and links." />
          <Button asChild variant="outline" className="mb-4">
            <Link href={`/projects/${id}`}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Project
            </Link>
          </Button>
        </div>
      </div>
      
      <SitemapClient pages={applicationMap.pages} edges={applicationMap.edges || []} />
    </div>
  );
}
