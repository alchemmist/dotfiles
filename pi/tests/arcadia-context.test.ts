import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { arcadiaContext } from "../extensions/lib/arcadia-context.ts";
import kit from "../extensions/kit-backend-rules.ts";
import mcp from "../extensions/arcadia-mcp-gate.ts";

test("any mount, nested yastore, symlinks and negative paths", () => {
 const dir = mkdtempSync(join(tmpdir(), "pi-arcadia-test-"));
 try {
 const root = join(dir, "arbitrary-checkout");
 mkdirSync(join(root,"yastore/backend/a"),{recursive:true}); mkdirSync(join(root,"yastore-other"));
 writeFileSync(join(root,".arcadia.root"),"");writeFileSync(join(root,"ya"),"");
 assert.equal(arcadiaContext(join(root,"yastore/backend/a"))?.yastore,true);
 assert.equal(arcadiaContext(join(root,"yastore-other"))?.yastore,false);
 assert.equal(arcadiaContext(dir),undefined);
 symlinkSync(join(root,"yastore"),join(dir,"alias"));
 assert.equal(arcadiaContext(join(dir,"alias"))?.root,root.replace(/^\/var\//,"/private/var/"));
 const events:any={};kit({on:(name:string,fn:any)=>events[name]=fn,registerCommand(){}} as any);
 const discovered=events.resources_discover({cwd:join(root,"yastore/backend/a")});
 assert.equal(discovered.skillPaths.length,0);
 assert.deepEqual(events.resources_discover({cwd:dir}).skillPaths,[]);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test("live checkout: all support skills, Temporal guidance and 8 rules", () => {
 const handlers:any={};kit({on:(name:string,fn:any)=>handlers[name]=fn,registerCommand(){}} as any);
 const cwd=process.env.HOME+"/arcadia/yastore";
 const resources=handlers.resources_discover({cwd});
 assert.ok(resources.skillPaths.some((p:string)=>p.endsWith("yastore/ai/kitsupport-skills/skills")));
 const event={systemPromptOptions:{sections:{}}};handlers.before_agent_start(event,{cwd});
 const text=(event.systemPromptOptions.sections as any).kit_backend_go_rules;
 assert.equal((text.match(/## Rule file:/g)||[]).length,8);assert.ok(text.includes("references/temporal-cli.md"));assert.ok(text.includes("ya tool temporal"));
 assert.equal(resources.skillPaths.filter((p:string)=>p.includes("ai/artifacts/skills/")).length,14);
});
test("MCP registration and checkout ya selection for an arbitrary mount",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pi-mcp-mount-"));const original=process.cwd();
 try {
 writeFileSync(join(dir,".arcadia.root"),"");writeFileSync(join(dir,"ya"),"");mkdirSync(join(dir,"yastore"));process.chdir(join(dir,"yastore"));
 const servers:any={};mcp({registerCommand(){},registerMcpServer:(name:string,config:any)=>servers[name]=config} as any);
 assert.equal(servers.playwright,undefined);assert.equal(servers["chrome-devtools"],undefined);
 assert.ok(servers.kitsql);assert.ok(servers.devtools);assert.ok(servers.tracker_mcp);
 assert.ok(servers.devtools.args.includes(arcadiaContext(process.cwd())!.root+"/ya"));
 assert.equal(servers.devtools.env.YA_SOURCE_ROOT,arcadiaContext(process.cwd())!.root);
 } finally {process.chdir(original);rmSync(dir,{recursive:true,force:true});}
});

test("Temporal requests get the canonical protocol next to the prompt and browser calls are blocked", () => {
 const handlers:any={};kit({on:(name:string,fn:any)=>handlers[name]=fn,registerCommand(){}} as any);
 const cwd=process.env.HOME+"/arcadia/yastore";
 const result=handlers.before_agent_start({messageType:"user",prompt:"посмотри процесс https://shopify.temporal.yandex-team.ru/namespaces/yastore/workflows/example/run/history",systemPromptOptions:{sections:{}}},{cwd});
 assert.equal(result.message.customType,"kit-temporal-route");
 assert.equal(result.message.display,false);
 assert.ok(result.message.content.includes("workflow describe"));
 assert.ok(result.message.content.includes("Не выполняй start"));
 for(const event of [
  {toolName:"codemode",input:{code:'await tools.mcp__playwright__browser_navigate({url:"https://shopify.temporal.yandex-team.ru"})'}},
  {toolName:"mcp__chrome_devtools__list_pages",input:{}},
  {toolName:"web_fetch",input:{url:"https://shopify.temporal.yandex-team.ru"}},
 ]) assert.equal(handlers.tool_call(event,{cwd}).block,true);
 assert.equal(handlers.tool_call({toolName:"bash",input:{command:"ya tool temporal workflow describe --help"}},{cwd}),undefined);
 handlers.before_agent_start({messageType:"user",prompt:"проверь фронтенд",systemPromptOptions:{sections:{}}},{cwd});
 assert.equal(handlers.tool_call({toolName:"mcp__playwright__browser_navigate",input:{}},{cwd}),undefined);
});

test("browser MCP is opt-in in KIT and is not silently re-enabled", async()=>{
 const cwd=process.cwd();process.chdir(process.env.HOME+"/arcadia/yastore");
 try {
 const servers:any={};const commands:any={};const notices:string[]=[];
 mcp({registerMcpServer:(name:string,config:any)=>servers[name]=config,unregisterMcpServer:(name:string)=>delete servers[name],registerCommand:(name:string,cmd:any)=>commands[name]=cmd} as any);
 assert.equal(servers.playwright,undefined);
 await commands["kit-browser"].handler("on",{ui:{notify:(s:string)=>notices.push(s)}});
 assert.equal(servers.playwright.enabled,true);
 await commands["kit-browser"].handler("off",{ui:{notify:(s:string)=>notices.push(s)}});
 assert.equal(servers.playwright,undefined);
 } finally {process.chdir(cwd);}
});
