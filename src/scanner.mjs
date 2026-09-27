import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { MANUAL_CHECKLIST, RULES, markdownReport, scanFiles, shouldScanPath, shouldSkipDirectory } from "./core.mjs";

async function swiftFiles(root, current = root) {
  let entries;
  try { entries = await readdir(current, { withFileTypes: true }); }
  catch (error) { throw new Error(`Could not read ${current}: ${error.code ?? error.message}`); }
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    const relativePath = path.relative(root, fullPath);
    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(entry.name)) files.push(...await swiftFiles(root, fullPath));
    } else if (entry.isFile() && shouldScanPath(relativePath)) {
      files.push(fullPath);
    }
  }
  return files;
}

export async function scanProject(projectPath) {
  const root = path.resolve(projectPath);
  let details;
  try { details = await stat(root); }
  catch { throw new Error(`Project path not found: ${root}`); }
  if (!details.isDirectory()) throw new Error(`Project path is not a directory: ${root}`);
  const absoluteFiles = (await swiftFiles(root)).sort();
  if (absoluteFiles.length === 0) throw new Error(`No Swift source files found under: ${root}`);
  const files = [];
  for (const file of absoluteFiles) {
    let source;
    try { source = await readFile(file, "utf8"); }
    catch (error) { throw new Error(`Could not read Swift source ${file}: ${error.code ?? error.message}`); }
    files.push({ path: path.relative(root, file), text: source });
  }
  const result = scanFiles(files, path.basename(root));
  return { root, files: result.files, findings: result.findings, counts: result.counts, rootName: result.rootName, scannedFileCount: result.scannedFileCount };
}

export { MANUAL_CHECKLIST, RULES, markdownReport };
