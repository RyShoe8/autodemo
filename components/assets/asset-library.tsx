"use client";

import { useState } from "react";
import { Download, FileText, Film, Music, Image as ImageIcon, Captions } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAssets } from "@/hooks/use-assets";
import { assetDisplayUrl, assetDownloadUrl } from "@/lib/storage/urls";
import { PLATFORM_SPECS, type AssetSummary, type Script } from "@/types";

function DownloadButton({
  url,
  name,
  label = "Download",
}: {
  url?: string;
  name: string;
  label?: string;
}) {
  if (!url) return null;
  return (
    <Button asChild size="sm" variant="outline">
      <a href={assetDownloadUrl(url, name)}>
        <Download className="h-4 w-4" /> {label}
      </a>
    </Button>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        {label}
      </CardContent>
    </Card>
  );
}

export function AssetLibrary({ videoId }: { videoId: string }) {
  const { assets, loading } = useAssets({ videoId });
  const [scriptOpen, setScriptOpen] = useState<AssetSummary | null>(null);

  if (loading && assets.length === 0) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <EmptyState label="No assets yet. Approve a workflow and let the pipeline finish to generate downloadable assets." />
    );
  }

  return (
    <>
      <Tabs defaultValue="videos">
        <TabsList className="flex-wrap">
          <TabsTrigger value="videos">
            <Film className="mr-1.5 h-4 w-4" /> Videos
          </TabsTrigger>
          <TabsTrigger value="thumbnails">
            <ImageIcon className="mr-1.5 h-4 w-4" /> Thumbnails
          </TabsTrigger>
          <TabsTrigger value="audio">
            <Music className="mr-1.5 h-4 w-4" /> Audio
          </TabsTrigger>
          <TabsTrigger value="scripts">
            <FileText className="mr-1.5 h-4 w-4" /> Scripts
          </TabsTrigger>
          <TabsTrigger value="captions">
            <Captions className="mr-1.5 h-4 w-4" /> Captions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="videos">
          <div className="grid gap-4 lg:grid-cols-2">
            {assets.map((asset) => (
              <Card key={`v-${asset.id}`}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {PLATFORM_SPECS[asset.platform].label}
                    <Badge variant="secondary">
                      {PLATFORM_SPECS[asset.platform].width}×
                      {PLATFORM_SPECS[asset.platform].height}
                    </Badge>
                  </CardTitle>
                  <DownloadButton
                    url={asset.videoUrl}
                    name={`${asset.platform}.mp4`}
                  />
                </CardHeader>
                <CardContent>
                  <video
                    src={assetDisplayUrl(asset.videoUrl)}
                    controls
                    poster={assetDisplayUrl(asset.thumbnailUrl)}
                    className="aspect-video w-full rounded-lg border bg-black"
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="thumbnails">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {assets.filter((a) => a.thumbnailUrl).length === 0 ? (
              <EmptyState label="No thumbnails generated." />
            ) : (
              assets.map((asset) =>
                asset.thumbnailUrl ? (
                  <Card key={`t-${asset.id}`}>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {PLATFORM_SPECS[asset.platform].label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={assetDisplayUrl(asset.thumbnailUrl)}
                        alt={`${asset.platform} thumbnail`}
                        className="w-full rounded-lg border"
                      />
                      <DownloadButton
                        url={asset.thumbnailUrl}
                        name={`${asset.platform}-thumbnail.png`}
                      />
                    </CardContent>
                  </Card>
                ) : null,
              )
            )}
          </div>
        </TabsContent>

        <TabsContent value="audio">
          {assets.filter((a) => a.audioUrl).length === 0 ? (
            <EmptyState label="No audio track (voice may be set to Browser Speech or No Audio)." />
          ) : (
            <div className="space-y-3">
              {assets
                .filter((a) => a.audioUrl)
                .slice(0, 1)
                .map((asset) => (
                  <Card key={`a-${asset.id}`}>
                    <CardHeader className="flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-base">
                        Narration track
                      </CardTitle>
                      <DownloadButton
                        url={asset.audioUrl}
                        name="narration.mp3"
                      />
                    </CardHeader>
                    <CardContent>
                      <audio
                        src={assetDisplayUrl(asset.audioUrl)}
                        controls
                        className="w-full"
                      />
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="scripts">
          <div className="grid gap-4 sm:grid-cols-2">
            {assets.slice(0, 1).map((asset) => (
              <Card key={`s-${asset.id}`}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Narration script</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setScriptOpen(asset)}
                    >
                      View
                    </Button>
                    {scriptDataUrl(asset.script) && (
                      <Button asChild size="sm" variant="outline">
                        <a
                          href={scriptDataUrl(asset.script)}
                          download="script.json"
                        >
                          <Download className="h-4 w-4" /> Download
                        </a>
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-4 text-sm text-muted-foreground">
                    {parseScript(asset.script)?.intro ?? "No script available."}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="captions">
          <div className="grid gap-4 sm:grid-cols-2">
            {assets.filter((a) => a.captionUrl).length === 0 ? (
              <EmptyState label="No captions generated." />
            ) : (
              assets.slice(0, 1).map((asset) => (
                <Card key={`c-${asset.id}`}>
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">Captions (SRT)</CardTitle>
                    <DownloadButton
                      url={asset.captionUrl}
                      name="captions.srt"
                    />
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    SubRip subtitle file synced to the narration timeline.
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(scriptOpen)}
        onOpenChange={(open) => !open && setScriptOpen(null)}
      >
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {parseScript(scriptOpen?.script)?.title ?? "Narration script"}
            </DialogTitle>
          </DialogHeader>
          <ScriptView script={parseScript(scriptOpen?.script)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function parseScript(raw?: string): Script | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Script;
  } catch {
    return null;
  }
}

function scriptDataUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  return `data:application/json;charset=utf-8,${encodeURIComponent(raw)}`;
}

function ScriptView({ script }: { script: Script | null }) {
  if (!script) {
    return <p className="text-sm text-muted-foreground">No script available.</p>;
  }
  return (
    <div className="space-y-4 text-sm">
      <section>
        <p className="font-medium">Intro</p>
        <p className="text-muted-foreground">{script.intro}</p>
      </section>
      <section className="space-y-2">
        <p className="font-medium">Scenes</p>
        <ol className="space-y-2">
          {script.scenes.map((scene, i) => (
            <li key={i} className="rounded-md border p-3">
              <p className="font-medium">
                {i + 1}. {scene.heading}{" "}
                <span className="text-xs text-muted-foreground">
                  ({scene.durationSeconds}s)
                </span>
              </p>
              <p className="text-muted-foreground">{scene.narration}</p>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <p className="font-medium">Outro</p>
        <p className="text-muted-foreground">{script.outro}</p>
      </section>
    </div>
  );
}
