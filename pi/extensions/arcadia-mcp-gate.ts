import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { arcadiaContext } from "./lib/arcadia-context.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const agentDir = `${homedir()}/.pi/agent`;
const configPath = `${agentDir}/arcadia-mcp.json`;
const arcadiaServers = ["sandbox", "tracker_mcp", "devtools", "cirp", "ci", "monium_mcp", "intrasearch", "abc", "yql"];

export default function (pi: ExtensionAPI): void {
  const cwd = process.cwd();
  const context = arcadiaContext(cwd);
  if (!context) return;

  let servers: Record<string, Record<string, unknown>>;
  try {
    servers = JSON.parse(readFileSync(configPath, "utf8")).mcpServers;
  } catch {
    return;
  }

  function mountConfig(config: Record<string, unknown>) {
    return {
      ...config,
      args: (config.args as string[] | undefined)?.map(arg => arg === "~/arcadia/ya" ? `${context!.root}/ya` : arg),
      env: { ...(config.env as Record<string, string> | undefined), ARCADIA_ROOT: context!.root, YA_SOURCE_ROOT: context!.root },
      enabled: true,
    };
  }

  const browserServers = ["playwright", "chrome-devtools"];
  if (!context.yastore) {
    for (const name of browserServers) {
      if (servers[name]) pi.registerMcpServer(name, mountConfig(servers[name]) as never);
    }
  } else {
    pi.registerCommand("kit-browser", {
      description: "Explicitly enable or disable browser MCP for KIT frontend work: on|off",
      handler: async (args, ctx) => {
        const action = args.trim();
        if (action !== "on" && action !== "off") {
          ctx.ui.notify("Usage: /kit-browser on|off. Browser is not used for Temporal or other internal backend APIs.", "info");
          return;
        }
        for (const name of browserServers) {
          if (action === "on" && servers[name]) pi.registerMcpServer(name, mountConfig(servers[name]) as never);
          else pi.unregisterMcpServer(name);
        }
        ctx.ui.notify(`KIT browser MCP: ${action}`, "info");
      },
    });
  }

  for (const name of arcadiaServers) {
    const config = servers[name];
    if (config) pi.registerMcpServer(name, mountConfig(config) as never);
  }

  if (context.yastore && servers.kitsql) {
    pi.registerMcpServer("kitsql", mountConfig(servers.kitsql) as never);
  }
}
