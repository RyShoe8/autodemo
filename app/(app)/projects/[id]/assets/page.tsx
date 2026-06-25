import { notFound } from "next/navigation";
import Link from "next/link";
import { Download, ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { assetDisplayUrl, assetDownloadUrl } from "@/lib/storage";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const dynamic = "force-dynamic";

export default async function AssetsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await db.getProject(id);
  if (!project) notFound();

  const applicationMap = project.applicationMap;
  const allVideos = await db.listVideosByProject(id);
  const allAssets = await db.listAssetsByProject(id);

  if (!applicationMap || !applicationMap.pages || applicationMap.pages.length === 0) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title={`${project.name} Assets`} description="No assets discovered yet." />
        <Button asChild variant="outline" className="mb-4">
          <Link href={`/projects/${id}`}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Project
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <PageHeader title={`${project.name} Assets Library`} description="Screenshots and videos grouped by page." />
          <Button asChild variant="outline" className="mb-4">
            <Link href={`/projects/${id}`}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Project
            </Link>
          </Button>
        </div>
        <Button asChild>
          <a href={`/api/projects/${id}/assets/package`} download={`autodemo-${id}-all-assets.zip`}>
            <Download className="h-4 w-4 mr-2" /> Download All Pages
          </a>
        </Button>
      </div>

      {applicationMap.pages.map((page, idx) => {
        // Find videos related to this page
        const relatedVideos = allVideos.filter((v) =>
          v.workflow?.some((step) => step.actionType === "navigate" && step.url === page.url)
        );
        const relatedAssets = allAssets.filter((a) => relatedVideos.some((v) => v.id === a.videoId));

        return (
          <Card key={idx} className="overflow-hidden">
            <CardHeader className="bg-muted/50 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle>{page.title || "Untitled Page"}</CardTitle>
                <CardDescription className="break-all">{page.url}</CardDescription>
              </div>
              <Button size="sm" variant="secondary" asChild>
                <a
                  href={`/api/projects/${id}/assets/package?pageUrl=${encodeURIComponent(page.url)}`}
                  download={`autodemo-page-assets.zip`}
                >
                  <Download className="h-4 w-4 mr-2" /> Download Package
                </a>
              </Button>
            </CardHeader>
            <CardContent className="pt-6 space-y-8">
              {/* Screenshots Section */}
              <div>
                <h4 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">
                  Discovered Screenshots
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                  {/* Base Screenshot */}
                  {page.screenshot && (
                    <div className="space-y-2 group">
                      <Dialog>
                        <DialogTrigger asChild>
                          <button className="relative w-full aspect-video overflow-hidden rounded-md border bg-muted hover:opacity-90 transition-opacity">
                             {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={assetDisplayUrl(page.screenshot)}
                              alt={`Base screenshot`}
                              className="object-cover object-top w-full h-full"
                            />
                          </button>
                        </DialogTrigger>
                        <DialogContent className="max-w-5xl p-1 bg-transparent border-none shadow-none">
                          <DialogTitle className="sr-only">Base screenshot</DialogTitle>
                          <DialogDescription className="sr-only">Full view</DialogDescription>
                          <div className="relative w-full max-h-[85vh] overflow-auto rounded-md bg-background">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={assetDisplayUrl(page.screenshot)} alt="Base screenshot" className="w-full h-auto" />
                          </div>
                        </DialogContent>
                      </Dialog>
                      <div className="flex items-center justify-between px-1">
                        <p className="text-sm font-medium">Full Page</p>
                        <Button size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" asChild>
                          <a href={assetDownloadUrl(page.screenshot, "full-page.jpg")} download>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Action Screenshots */}
                  {page.actionScreenshots?.map((action, aIdx) => (
                    <div key={aIdx} className="space-y-2 group">
                      <Dialog>
                        <DialogTrigger asChild>
                          <button className="relative w-full aspect-video overflow-hidden rounded-md border bg-muted hover:opacity-90 transition-opacity">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={assetDisplayUrl(action.screenshot)}
                              alt={`Action: ${action.triggerText}`}
                              className="object-cover object-top w-full h-full"
                            />
                          </button>
                        </DialogTrigger>
                        <DialogContent className="max-w-5xl p-1 bg-transparent border-none shadow-none">
                          <DialogTitle className="sr-only">Action: {action.triggerText}</DialogTitle>
                          <DialogDescription className="sr-only">Full view</DialogDescription>
                          <div className="relative w-full max-h-[85vh] overflow-auto rounded-md bg-background">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={assetDisplayUrl(action.screenshot)} alt="Action screenshot" className="w-full h-auto" />
                          </div>
                        </DialogContent>
                      </Dialog>
                      <div className="flex items-center justify-between px-1">
                        <p className="text-sm font-medium truncate" title={action.triggerText}>
                          Trigger: {action.triggerText}
                        </p>
                        <Button size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" asChild>
                          <a href={assetDownloadUrl(action.screenshot, `action-${action.triggerText}.jpg`)} download>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Videos Section */}
              {relatedAssets.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">
                    Generated Videos
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                    {relatedAssets.map((asset) => {
                      const videoRecord = relatedVideos.find((v) => v.id === asset.videoId);
                      const title = videoRecord?.name || asset.platform;
                      return (
                        <div key={asset.id} className="space-y-2 group">
                          <div className="relative w-full aspect-video overflow-hidden rounded-md border bg-black flex items-center justify-center">
                            <video
                              src={assetDisplayUrl(asset.videoUrl)}
                              poster={asset.thumbnailUrl ? assetDisplayUrl(asset.thumbnailUrl) : undefined}
                              controls
                              className="w-full h-full"
                              preload="metadata"
                            />
                          </div>
                          <div className="flex items-center justify-between px-1">
                            <p className="text-sm font-medium truncate" title={title}>
                              {title} ({asset.platform})
                            </p>
                            <Button size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" asChild>
                              <a href={assetDownloadUrl(asset.videoUrl, `${title}.mp4`)} download>
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
