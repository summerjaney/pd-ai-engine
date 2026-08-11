import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ZipArchive } from "archiver";
import { prepareDocumentExport } from "../document/service.js";
import { packageDelivery } from "./package.js";

export async function buildFormalDelivery(requirementDirectory: string): Promise<{ directory: string; zipPath: string; documentManifestPath: string; deliveryManifestPath: string }> {
  const root = path.resolve(requirementDirectory);
  const directory = path.join(root, "12-delivery");
  await mkdir(directory, { recursive: true });
  const documents = await prepareDocumentExport(root, ["docx", "pdf"]);
  if (documents.manifest.status !== "GENERATED") throw new Error("正式文档生成失败，已阻止交付包打包。");
  const delivery = await packageDelivery(root);
  const zipPath = path.join(directory, "formal-delivery-package.zip");
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    archive.glob("**/*", { cwd: root, ignore: ["12-delivery/formal-delivery-package.zip"] });
    void archive.finalize();
  });
  const metadata = await stat(zipPath);
  const zip = await readFile(zipPath);
  const packageStatePath = path.join(directory, "formal-package-manifest.json");
  const documentEntries = await Promise.all(documents.manifest.results.map(async (item) => {
    const content = await readFile(item.outputPath);
    return { format: item.format, status: item.status, path: path.relative(root, item.outputPath), size: content.length, sha256: createHash("sha256").update(content).digest("hex") };
  }));
  await writeFile(packageStatePath, `${JSON.stringify({ schemaVersion: "0.9", generatedAt: new Date().toISOString(), archive: { path: path.basename(zipPath), size: metadata.size, sha256: createHash("sha256").update(zip).digest("hex") }, documents: documentEntries }, null, 2)}\n`, "utf8");
  if (zip.subarray(0, 2).toString() !== "PK") throw new Error("ZIP 交付包结构无效。");
  return { directory, zipPath, documentManifestPath: documents.manifestPath, deliveryManifestPath: delivery.manifestPath };
}
