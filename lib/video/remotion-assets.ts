import fs from "node:fs/promises";
import path from "node:path";

interface StaticFileEntry {
  name: string;
  src: string;
  sizeInBytes: number;
  lastModified: number;
}

function parseBundleIndex(html: string): {
  staticBase: string;
  staticFiles: StaticFileEntry[];
} {
  const baseMatch = html.match(
    /window\.remotion_staticBase\s*=\s*"([^"]+)"/,
  );
  const filesMatch = html.match(
    /window\.remotion_staticFiles\s*=\s*(\[[\s\S]*?\])\s*(?:window\.|<\/script>)/,
  );
  if (!baseMatch) {
    throw new Error("Could not parse remotion_staticBase from bundle index.html");
  }
  if (!filesMatch) {
    throw new Error(
      "Could not parse remotion_staticFiles from bundle index.html",
    );
  }
  return {
    staticBase: baseMatch[1],
    staticFiles: JSON.parse(filesMatch[1]) as StaticFileEntry[],
  };
}

async function registerAssetsInBundleManifest(
  bundleDir: string,
  entries: { assetName: string; sizeInBytes: number; lastModified: number }[],
): Promise<Map<string, string>> {
  const indexPath = path.join(bundleDir, "index.html");
  const html = await fs.readFile(indexPath, "utf8");
  const { staticBase, staticFiles } = parseBundleIndex(html);

  const urls = new Map<string, string>();
  let manifest = [...staticFiles];

  for (const { assetName, sizeInBytes, lastModified } of entries) {
    const src = `/${staticBase}/${assetName}`;
    manifest = manifest.filter((f) => f.name !== assetName);
    manifest.push({ name: assetName, src, sizeInBytes, lastModified });
    urls.set(assetName, src);
  }

  const updated = html.replace(
    /window\.remotion_staticFiles\s*=\s*\[[\s\S]*?\]/,
    `window.remotion_staticFiles = ${JSON.stringify(manifest)}`,
  );
  await fs.writeFile(indexPath, updated, "utf8");
  return urls;
}

export interface StagedClip {
  sceneIndex: number;
  assetName: string;
  staticUrl: string;
  sizeInBytes: number;
}

/** Copy per-scene clips into the Remotion bundle public folder. */
export async function stageClipsInRemotionBundle(
  bundleDir: string,
  clips: Map<number, string>,
  jobId: string,
): Promise<StagedClip[]> {
  const staged: StagedClip[] = [];
  const manifestEntries: {
    assetName: string;
    sizeInBytes: number;
    lastModified: number;
  }[] = [];

  for (const [sceneIndex, sourcePath] of clips) {
    const assetName = `session-${jobId}-scene-${sceneIndex}.mp4`;
    const dest = path.join(bundleDir, "public", assetName);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(sourcePath, dest);

    const stat = await fs.stat(dest);
    manifestEntries.push({
      assetName,
      sizeInBytes: stat.size,
      lastModified: stat.mtimeMs,
    });
    staged.push({
      sceneIndex,
      assetName,
      staticUrl: "",
      sizeInBytes: stat.size,
    });
  }

  if (manifestEntries.length > 0) {
    const urls = await registerAssetsInBundleManifest(bundleDir, manifestEntries);
    for (const clip of staged) {
      clip.staticUrl = urls.get(clip.assetName) ?? "";
    }
  }

  return staged;
}
