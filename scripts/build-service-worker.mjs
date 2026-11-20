import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const output = "out";
const assetRoots = ["_next/static", "covers", "fonts", "icons"];
const assets = ["manifest.webmanifest"];
const pages = {
  "/": "index.html",
  "/editor/": "editor/index.html",
  "/production/": "production/index.html",
  "/print/": "print/index.html",
  "/call-sheet-print/": "call-sheet-print/index.html",
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
const { outputFiles } = await build({
  stdin: { contents: template, sourcefile: "service-worker.js", resolveDir: resolve("scripts") },
  bundle: true, write: false, minify: true, target: "es2022",
  define: { "process.env.NODE_ENV": '"production"' },
});
const bundled = outputFiles[0].text;
hash.update(bundled);
const version = hash.digest("hex").slice(0, 16);
const urls = [...Object.keys(pages), ...assets.map((path) => "/" + path.split("/").map(encodeURIComponent).join("/"))];
if (!bundled.includes("__CACHE_VERSION__") || !bundled.includes('"__PRECACHE_URLS__"')) {
  throw new Error("Service worker cache markers are missing");
}
const worker = bundled
  .replace("__CACHE_VERSION__", version)
  .replace('"__PRECACHE_URLS__"', JSON.stringify(urls));

await writeFile(join(output, "sw.js"), worker);
console.log(`Service worker built with ${urls.length} precached URLs.`);
