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

async function registerAssetInBundleManifest(
  bundleDir: string,
  assetName: string,
  sizeInBytes: number,
  lastModified: number,
): Promise<string> {
  const indexPath = path.join(bundleDir, "index.html");
  const html = await fs.readFile(indexPath, "utf8");
  const { staticBase, staticFiles } = parseBundleIndex(html);

  const src = `/${staticBase}/${assetName}`;
  const filtered = staticFiles.filter((f) => f.name !== assetName);
  filtered.push({ name: assetName, src, sizeInBytes, lastModified });

  const updated = html.replace(
    /window\.remotion_staticFiles\s*=\s*\[[\s\S]*?\]/,
    `window.remotion_staticFiles = ${JSON.stringify(filtered)}`,
  );
  await fs.writeFile(indexPath, updated, "utf8");
  return src;
}

export interface StagedVideoResult {
  assetName: string;
  staticUrl: string;
  sizeInBytes: number;
}

/** Copy a local video into the Remotion bundle public folder for OffthreadVideo. */
export async function stageVideoInRemotionBundle(
  bundleDir: string,
  sourcePath: string,
  assetName: string,
): Promise<StagedVideoResult> {
  const dest = path.join(bundleDir, "public", assetName);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(sourcePath, dest);

  const stat = await fs.stat(dest);
  const staticUrl = await registerAssetInBundleManifest(
    bundleDir,
    assetName,
    stat.size,
    stat.mtimeMs,
  );

  return { assetName, staticUrl, sizeInBytes: stat.size };
}
