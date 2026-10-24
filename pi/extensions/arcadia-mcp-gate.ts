import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const agentDir = `${homedir()}/.pi/agent`;
const configPath = `${agentDir}/arcadia-mcp.json`;
const arcadiaRoot = resolve(`${homedir()}/arcadia`);
const yastoreRoot = resolve(`${homedir()}/arcadia/yastore`);
const arcadiaServers = ["sandbox", "tracker_mcp", "devtools", "cirp", "ci", "monium_mcp", "intrasearch", "yql", "playwright", "chrome-devtools"];

function inside(path: string, root: string): boolean {
  const rel = relative(root, resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export default function (pi: ExtensionAPI): void {
  const cwd = process.cwd();
  if (!inside(cwd, arcadiaRoot)) return;

  let servers: Record<string, Record<string, unknown>>;
  try {
    servers = JSON.parse(readFileSync(configPath, "utf8")).mcpServers;
  } catch {
    return;
  }

  for (const name of arcadiaServers) {
    const config = servers[name];
    if (config) pi.registerMcpServer(name, { ...config, enabled: true } as never);
  }

  if (inside(cwd, yastoreRoot) && servers.kitsql) {
    pi.registerMcpServer("kitsql", { ...servers.kitsql, enabled: true } as never);
  }
}
