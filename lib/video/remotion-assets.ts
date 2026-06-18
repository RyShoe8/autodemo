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

export interface StageAssetInput {
  assetName: string;
  sourcePath?: string;
  buffer?: Buffer;
}

function extensionFromUrl(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (ext === "jpeg") return "jpg";
  return ext || "png";
}

export function screenshotAssetName(jobId: string, index: number, url: string): string {
  return `scene-${jobId}-${index}.${extensionFromUrl(url)}`;
}

/** Write one or more assets into bundle public/ and patch the Remotion manifest. */
export async function stageAssetsInRemotionBundle(
  bundleDir: string,
  assets: StageAssetInput[],
): Promise<Map<string, string>> {
  const manifestEntries: {
    assetName: string;
    sizeInBytes: number;
    lastModified: number;
  }[] = [];

  for (const asset of assets) {
    const dest = path.join(bundleDir, "public", asset.assetName);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    if (asset.buffer) {
      await fs.writeFile(dest, asset.buffer);
    } else if (asset.sourcePath) {
      await fs.copyFile(asset.sourcePath, dest);
    } else {
      throw new Error(`No source for asset ${asset.assetName}`);
    }
    const stat = await fs.stat(dest);
    manifestEntries.push({
      assetName: asset.assetName,
      sizeInBytes: stat.size,
      lastModified: stat.mtimeMs,
    });
  }

  if (manifestEntries.length === 0) return new Map();
  return registerAssetsInBundleManifest(bundleDir, manifestEntries);
}

/** Copy per-scene clips into the Remotion bundle public folder. */
export async function stageClipsInRemotionBundle(
  bundleDir: string,
  clips: Map<number, string>,
  jobId: string,
): Promise<StagedClip[]> {
  const entries = [...clips.entries()].sort(([a], [b]) => a - b);
  const assets: StageAssetInput[] = entries.map(([sceneIndex, sourcePath]) => ({
    assetName: `session-${jobId}-scene-${sceneIndex}.mp4`,
    sourcePath,
  }));

  const urls = await stageAssetsInRemotionBundle(bundleDir, assets);
  const staged: StagedClip[] = [];

  for (let i = 0; i < entries.length; i++) {
    const [sceneIndex] = entries[i];
    const assetName = assets[i].assetName;
    const dest = path.join(bundleDir, "public", assetName);
    const stat = await fs.stat(dest);
    staged.push({
      sceneIndex,
      assetName,
      staticUrl: urls.get(assetName) ?? "",
      sizeInBytes: stat.size,
    });
  }

  return staged;
}
