import fs from "node:fs/promises";
import path from "node:path";
import { staticFile } from "remotion";

/** Copy a local video into the Remotion bundle public folder for OffthreadVideo. */
export async function stageVideoInRemotionBundle(
  bundleDir: string,
  sourcePath: string,
  assetName: string,
): Promise<string> {
  const dest = path.join(bundleDir, "public", assetName);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(sourcePath, dest);
  return staticFile(assetName);
}
