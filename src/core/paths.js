import os from "node:os";
import path from "node:path";

export function homeDir() {
  return os.homedir();
}

export function expandHome(inputPath) {
  if (!inputPath) return inputPath;
  if (inputPath === "~") return homeDir();
  if (inputPath.startsWith("~/")) {
    return path.join(homeDir(), inputPath.slice(2));
  }
  return inputPath;
}

export function ensureAbsolute(inputPath) {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
}

export function slugToPathHint(slug) {
  if (!slug) return "unknown";
  if (!slug.startsWith("-")) return slug;
  return slug
    .split("-")
    .filter(Boolean)
    .join("/");
}
