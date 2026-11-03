import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { arcadiaContext } from "./lib/arcadia-context.js";

const agentDir = join(homedir(), ".pi", "agent");
type Config = { skillPaths: string[] };

export default function (pi: ExtensionAPI): void {
  const config: Config = JSON.parse(readFileSync(join(agentDir, "kit-backend-rules.json"), "utf8"));

  function load(cwd: string) {
    const context = arcadiaContext(cwd);
    if (!context?.yastore) return { names: [] as string[], text: "", skillPaths: [] as string[], missing: [] as string[] };
    const root = context.root;
    const rulesDir = join(root, "ai/artifacts/rules/kit/backend-go");
    const names = existsSync(rulesDir) ? readdirSync(rulesDir).filter(name => name.endsWith(".md")).sort() : [];
    const skillPaths = config.skillPaths.map(path => join(root, path));
    const missing = skillPaths.filter(path => !existsSync(path));
    if (!names.length) missing.push(rulesDir);
    const reviewer = join(root, "yastore/ai/kitsupport-skills/skills/kit-support-run-reviewer");
    const temporal = join(reviewer, "references/temporal-cli.md");
    if (!existsSync(temporal)) missing.push(temporal);
    const text = [
      `KIT backend-go and KIT Support are active in this Arcadia checkout: ${root}.`,
      "Read the relevant SKILL.md before using a skill. Support skills are available in the skill catalog; do not load all of their bodies at once.",
      `For Temporal workflow/activity/history/heartbeat questions or temporal.yandex-team.ru URLs, first read ${temporal} and ${join(reviewer, "references/tool-output.md")}.`,
      `Use the official read-only ya tool temporal through bash. A separate Temporal MCP tool is not required. Use ${join(root, "ya")} with YA_SOURCE_ROOT=${root} after checking the CLI help and the protocol.`,
      "Do not try web_fetch, Playwright or browser authentication for an internal Temporal URL. Before claiming that access is unavailable, check the prescribed CLI and report its actual failure, if any. Never mutate workflows or credentials during diagnosis.",
      "The complete backend-go rules below are already in context. Apply each only to matching paths relative to yastore/.",
      ...names.map(name => `\n## Rule file: ${name}\n\n${readFileSync(join(rulesDir, name), "utf8")}`),
    ].join("\n");
    return { names, text, skillPaths: skillPaths.filter(path => existsSync(path)), missing };
  }

  pi.on("resources_discover", event => ({ skillPaths: load(event.cwd).skillPaths }));
  pi.on("session_start", (_event, ctx) => {
    const data = load(ctx.cwd);
    if (data.text && ctx.hasUI) ctx.ui.notify(`KIT: loaded ${data.names.length} rules; backend and support skill paths registered for this mount`, "info");
    if (data.missing.length) ctx.ui.notify(`KIT resources missing from current mount:\n${data.missing.join("\n")}`, "warning");
  });
  let temporalTask = false;
  pi.on("before_agent_start", (event, ctx) => {
    const data = load(ctx.cwd);
    if (data.text) event.systemPromptOptions.sections.kit_backend_go_rules = data.text;
    else delete event.systemPromptOptions.sections.kit_backend_go_rules;
    if (event.messageType === "user" || typeof event.prompt === "string") {
      temporalTask = !!data.text && /temporal|heartbeat|workflow/i.test(event.prompt ?? "");
    }
    if (temporalTask && data.text) {
      const root = arcadiaContext(ctx.cwd)!.root;
      const reviewer = join(root, "yastore/ai/kitsupport-skills/skills/kit-support-run-reviewer");
      const protocol = join(reviewer, "references/temporal-cli.md");
      if (!existsSync(protocol)) return;
      return { message: {
        customType: "kit-temporal-route",
        display: false,
        content: [
          "Local KIT configuration for this Temporal request: use bash and the official ya tool temporal, not MCP browser tools or web_fetch. Do not ask for browser login or screenshots in place of checking the CLI.",
          `Checkout root: ${root}; ya: ${join(root, "ya")}; YA_SOURCE_ROOT=${root}.`,
          `Canonical protocol already loaded below from ${protocol}:`,
          readFileSync(protocol, "utf8"),
          `Before workflow history, read ${join(reviewer, "references/tool-output.md")}. Capture raw output in private tmp files and expose only bounded technical fields.`,
          "Do the requested read-only investigation, not merely a description of what you could do. If the CLI fails, report that specific failure; do not switch to browser authentication. Do not change workflows, authorization or configuration.",
        ].join("\n\n"),
      } };
    }
  });
  pi.on("tool_call", (event, ctx) => {
    if (!temporalTask || !arcadiaContext(ctx.cwd)?.yastore) return;
    const input = JSON.stringify(event.input ?? {});
    if (/playwright|chrome.?devtools|browser_/i.test(event.toolName + " " + input) ||
        (event.toolName === "web_fetch" && /temporal\.yandex-team\.ru/i.test(input))) {
      return { block: true, reason: "KIT Temporal diagnosis must use the official read-only ya tool temporal via bash. The canonical temporal-cli.md protocol is already in context. Browser/API bypass is not permitted for this diagnosis." };
    }
  });
  pi.registerCommand("kit-rules", {
    description: "Show KIT rules and skill paths for this Arcadia mount",
    handler: async (_args, ctx) => {
      const data = load(ctx.cwd);
      ctx.ui.notify(data.text ? `Rules:\n${data.names.join("\n")}\nSkills:\n${data.skillPaths.join("\n")}\nMissing:\n${data.missing.join("\n") || "none"}` : "KIT resources are inactive outside Arcadia yastore/", "info");
    },
  });
}
