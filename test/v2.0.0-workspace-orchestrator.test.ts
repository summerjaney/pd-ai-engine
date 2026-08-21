import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WorkspaceOrchestrator } from "../src/workspace-orchestrator/service.js";
import { MarketEvidenceService } from "../src/market-evidence/service.js";
async function json(file:string,value:unknown){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,`${JSON.stringify(value,null,2)}\n`);}
test("v2.0.0 编排器根据真实文件识别阻断、下一步和审计运行",async()=>{const root=await mkdtemp(path.join(os.tmpdir(),"pae-workspace-"));await json(path.join(root,"project.json"),{projectId:"base",projectName:"基础平台"});const s=new WorkspaceOrchestrator();const status=await s.inspect(root);assert.equal(status.next[0]?.id,"register-evidence");assert.match(status.blockers[0]?.id??"",/EVIDENCE/);assert.match((await s.writePlan(root)).jsonPath,/workspace-plan/);const run=await s.run(root);assert.equal(run.actions[0]?.result,"PLANNED");assert.equal((await s.run(root,false,false,run.id)).startedAt,run.startedAt);await assert.rejects(()=>s.run(root,true,false),/--execute --confirm/);assert.equal((await s.history(root)).length,1);});

test("v2.0.0 仅安全续办确定性发现生成并记录调用服务",async()=>{const root=await mkdtemp(path.join(os.tmpdir(),"pae-workspace-safe-"));await json(path.join(root,"project.json"),{projectId:"base",projectName:"基础平台"});const input=path.join(root,"evidence.json");await json(input,{id:"customer.role",name:"角色反馈",type:"customer-feedback",source:"脱敏访谈",collectedAt:"2026-08-21T00:00:00.000Z",sensitivity:"internal",summary:"配置复杂",locator:{recordId:"R1"}});await new MarketEvidenceService().add(path.join(root,"market-evidence"),input);const run=await new WorkspaceOrchestrator().run(root,true,true);assert.equal(run.actions[0]?.service,"discovery-service");assert.equal(run.actions[0]?.result,"COMPLETED");});
