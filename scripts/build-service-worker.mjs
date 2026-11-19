import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const output = "out";
const assetRoots = ["_next/static", "covers", "icons"];
const assets = ["manifest.webmanifest"];
const pages = {
  "/": "index.html",
  "/editor/": "editor/index.html",
  "/production/": "production/index.html",
};

for (const root of assetRoots) {
  const entries = await readdir(join(output, root), {
    recursive: true,
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (entry.isFile()) {
      assets.push(join(entry.parentPath, entry.name).slice(output.length + 1));
    }
  }
}

assets.sort();
const hash = createHash("sha256");
for (const path of [...Object.values(pages), ...assets]) {
  hash.update(path).update(await readFile(join(output, path)));
}

const template = await readFile("scripts/service-worker.js", "utf8");
hash.update(template);
const version = hash.digest("hex").slice(0, 16);
const urls = [...Object.keys(pages), ...assets.map((path) => "/" + path.split("/").map(encodeURIComponent).join("/"))];
const worker = template
  .replace("__CACHE_VERSION__", version)
  .replace('"__PRECACHE_URLS__"', JSON.stringify(urls));

await writeFile(join(output, "sw.js"), worker);
console.log(`Service worker built with ${urls.length} precached URLs.`);
