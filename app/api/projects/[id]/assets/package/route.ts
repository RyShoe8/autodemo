import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readAsset } from "@/lib/storage";

// @ts-ignore
import archiver from "archiver";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const pageUrlFilter = searchParams.get("pageUrl");

  const project = await db.getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const applicationMap = project.applicationMap;
  if (!applicationMap) {
    return NextResponse.json({ error: "Discovery not run" }, { status: 400 });
  }

  const allVideos = await db.listVideosByProject(id);
  const allAssets = await db.listAssetsByProject(id);

  // Filter logic
  let pagesToInclude = applicationMap.pages;
  if (pageUrlFilter) {
    pagesToInclude = pagesToInclude.filter((p) => p.url === pageUrlFilter);
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.on("data", (chunk: Buffer) => {
    writer.write(new Uint8Array(chunk)).catch(() => {});
  });

  archive.on("end", () => {
    writer.close().catch(() => {});
  });

  archive.on("error", (err: Error) => {
    writer.abort(err).catch(() => {});
  });

  // Start assembling the archive in the background
  (async () => {
    try {
      const addedPaths = new Set<string>();

      const addFile = async (url: string, archivePath: string) => {
        if (!url || addedPaths.has(archivePath)) return;
        try {
          const buffer = await readAsset(url);
          archive.append(buffer, { name: archivePath });
          addedPaths.add(archivePath);
        } catch (err) {
          console.error(`Failed to read asset ${url}:`, err);
        }
      };

      for (const page of pagesToInclude) {
        const safeTitle = (page.title || "Untitled Page")
          .replace(/[^a-z0-9]/gi, "_")
          .toLowerCase();

        // 1. Base screenshot
        if (page.screenshot) {
          await addFile(
            page.screenshot,
            `${safeTitle}/screenshot-full.jpg`,
          );
        }

        // 2. Action screenshots
        if (page.actionScreenshots) {
          for (let i = 0; i < page.actionScreenshots.length; i++) {
            const action = page.actionScreenshots[i];
            const safeAction = (action.triggerText || `action-${i}`)
              .replace(/[^a-z0-9]/gi, "_")
              .toLowerCase();
            await addFile(
              action.screenshot,
              `${safeTitle}/actions/${safeAction}.jpg`,
            );
          }
        }

        // 3. Videos related to this page
        for (const video of allVideos) {
          const isRelated = video.workflow?.some(
            (step) => step.actionType === "navigate" && step.url === page.url,
          );
          if (isRelated) {
            const videoAssets = allAssets.filter((a) => a.videoId === video.id);
            for (const asset of videoAssets) {
              const safeVideo = (video.name || video.id)
                .replace(/[^a-z0-9]/gi, "_")
                .toLowerCase();
              if (asset.videoUrl) {
                await addFile(
                  asset.videoUrl,
                  `${safeTitle}/videos/${safeVideo}_${asset.platform}.mp4`,
                );
              }
            }
          }
        }
      }

      await archive.finalize();
    } catch (err) {
      console.error("Archive error:", err);
      archive.abort();
    }
  })();

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="autodemo-assets-${id}.zip"`,
    },
  });
}
