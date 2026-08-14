import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addRequirementSource, readRequirementSourceIndex } from "../src/requirement-sources/service.js";
import { prepareRequirementOutput } from "../src/output/requirement-output.js";

test("TC-130-003: 登记多种真实需求来源并生成可追溯索引", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v130-sources-"));
  const requirement = path.join(root, "requirement");
  const source = path.join(root, "meeting notes.md");
  await writeFile(source, "# 会议记录\n\n客户希望增加字段联动。");
  const output = await addRequirementSource(requirement, source, { label: "客户需求沟通", type: "meeting-note", sensitivity: "internal" });
  assert.equal(output.source.id, "SRC-001");
  assert.equal(output.source.originalName, "meeting-notes.md");
  assert.equal(output.source.includeInAnalysis, true);
  assert.equal(output.source.sha256.length, 64);
  assert.match(await readFile(path.join(requirement, "00-sources", "source-index.md"), "utf8"), /客户需求沟通/);
});

test("TC-130-004: 相同内容来源禁止重复登记且敏感资料可排除分析", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v130-sources-"));
  const source = path.join(root, "private.txt");
  await writeFile(source, "内部资料");
  await addRequirementSource(root, source, { type: "other", sensitivity: "confidential", includeInAnalysis: false });
  await assert.rejects(() => addRequirementSource(root, source, { type: "other", sensitivity: "confidential" }), /已登记/);
  const index = await readRequirementSourceIndex(root);
  assert.equal(index.sources[0].includeInAnalysis, false);
  assert.equal(index.sources[0].sensitivity, "confidential");
});

test("TC-130-005: 创建需求时自动登记原始需求且修订后更新指纹", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v130-primary-"));
  const options = { outputRoot: root, projectId: "base-platform", projectName: "基础平台", productVersion: "3.3.0", requirementId: "REQ-301", requirementName: "field-linkage" };
  const first = await prepareRequirementOutput(options, { sourcePath: "/Users/demo/private/requirement.md", title: "字段联动", content: "# 字段联动\n\n第一版" });
  const firstIndex = await readRequirementSourceIndex(first.requirementDirectory);
  assert.equal(firstIndex.sources[0].id, "SRC-000");
  assert.equal(firstIndex.sources[0].originalName, "requirement.md");
  const firstHash = firstIndex.sources[0].sha256;
  await prepareRequirementOutput(options, { sourcePath: "/Users/demo/private/requirement.md", title: "字段联动", content: "# 字段联动\n\n第二版" });
  const secondIndex = await readRequirementSourceIndex(first.requirementDirectory);
  assert.notEqual(secondIndex.sources[0].sha256, firstHash);
  assert.ok(!JSON.stringify(secondIndex).includes("/Users/"));
});
