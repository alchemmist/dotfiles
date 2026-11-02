import { describe, it, expect } from 'vitest';
import {create,fromBinary} from '@bufbuild/protobuf';
import { handleExecMessage,parseConnectEndStream } from './proxy.js';
import { ExecServerMessageSchema,AgentClientMessageSchema } from './proto/agent_pb.js';
describe('current Cursor compatibility',()=>{
 it('answers MCP state discovery without hanging and preserves exec identifiers',()=>{
  const request=create(ExecServerMessageSchema,{id:123,execId:'test-exec'});
  (request as any).$unknown=[{no:36,wireType:2,data:Uint8Array.from([4,10,2,112,105])}];
  let frame:Uint8Array|undefined;
  handleExecMessage(request,[],data=>{frame=data;},()=>{throw Error('unexpected tool execution');});
  expect(frame).toBeDefined();
  const response=fromBinary(AgentClientMessageSchema,frame!.slice(5));
  expect(response.message.case).toBe('execClientMessage');
  const reply:any=response.message.value;
  expect(reply.id).toBe(123);expect(reply.execId).toBe('test-exec');
  expect(reply.$unknown.some((f:any)=>f.no===36)).toBe(true);
 });
 it('surfaces Cursor billing reason, not generic finish_reason:error',()=>{
 const error=parseConnectEndStream(new TextEncoder().encode(JSON.stringify({error:{code:'resource_exhausted',message:'Error',details:[{debug:{details:{title:'Model not included',detail:'Buy credits',additionalInfo:{rateLimitReason:'prepaid_balance_exhausted'}}}}]}})));
 expect(error?.message).toContain('Model not included');expect(error?.message).toContain('prepaid_balance_exhausted');
 });
});
