import fs from "node:fs/promises";
import path from "node:path";

export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function* walkFiles(root, options = {}) {
  const { maxDepth = Infinity, filter = () => true } = options;
  yield* walk(root, 0, maxDepth, filter);
}

async function* walk(root, depth, maxDepth, filter) {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (depth < maxDepth) {
        yield* walk(fullPath, depth + 1, maxDepth, filter);
      }
      continue;
    }
    if (entry.isFile() && filter(fullPath)) {
      yield fullPath;
    }
  }
}

export async function readJsonLines(filePath, onLine) {
  const content = await fs.readFile(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      onLine(JSON.parse(trimmed));
    } catch {
      // Ignore malformed lines in best-effort MVP parsing.
    }
  }
}

export async function writeTextFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}
