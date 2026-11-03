import { execFile } from "node:child_process";
import { arcadiaContext } from "./lib/arcadia-context.js";
import { promisify } from "node:util";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const execFileAsync = promisify(execFile);

export default function (pi: ExtensionAPI): void {
  if (!arcadiaContext(process.cwd())) return;
  pi.registerTool({
    name: "arcanum_update_pr_description",
    label: "Update Arcanum PR description",
    description: "Update the description/body of an Arcanum pull request. Use only when the user explicitly asks to change the PR description.",
    parameters: Type.Object({
      pr_id: Type.Integer({ description: "Arcanum pull request id" }),
      description: Type.String({ description: "New pull request description" }),
    }),
    async execute(_toolCallId, args) {
      const { stdout, stderr } = await execFileAsync("ya", [
        "tool",
        "arcanum",
        "pr",
        "update-description",
        "--id",
        String(args.pr_id),
        "--description",
        args.description,
        "--json",
      ], { cwd: process.cwd(), maxBuffer: 1024 * 1024 });
      return { content: [{ type: "text", text: (stdout || stderr).trim() || "PR description updated." }] };
    },
  });
}
