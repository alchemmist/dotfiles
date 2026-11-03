import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI): void {
  let root: string;
  let cwd: string;
  try {
    root = realpathSync(resolve(homedir(), "code/lms"));
    cwd = realpathSync(process.cwd());
  } catch {
    return;
  }

  const path = relative(root, cwd);
  if (isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`)) return;

  pi.registerMcpServer("notion", {
    url: "https://mcp.notion.com/mcp",
    enabled: true,
  });
}
