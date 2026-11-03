import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export function arcadiaContext(cwd: string): { root: string; yastore: boolean } | undefined {
  let current: string;
  try { current = realpathSync(cwd); } catch { return undefined; }
  const location = current;
  while (true) {
    if (existsSync(join(current, ".arcadia.root")) && existsSync(join(current, "ya"))) {
      const rel = relative(join(current, "yastore"), location);
      return { root: current, yastore: rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) };
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
