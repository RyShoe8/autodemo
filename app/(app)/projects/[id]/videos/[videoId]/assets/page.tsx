import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { toProjectVideoDTO } from "@/lib/serialize";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { VideoStatusBadge } from "@/components/status/status-badge";
import { AssetLibrary } from "@/components/assets/asset-library";

export const dynamic = "force-dynamic";

export default async function VideoAssetsPage({
  params,
}: {
  params: Promise<{ id: string; videoId: string }>;
}) {
  const { id, videoId } = await params;
  const videoRecord = await db.getVideo(videoId);
  if (!videoRecord || videoRecord.projectId !== id) notFound();
  const video = toProjectVideoDTO(videoRecord);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Video assets" description={video.name}>
        <VideoStatusBadge status={video.status} />
        <Button asChild variant="outline">
          <Link href={`/projects/${id}/videos/${videoId}`}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>
      </PageHeader>
      <AssetLibrary videoId={videoId} />
    </div>
  );
}
