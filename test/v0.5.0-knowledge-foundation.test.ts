import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { KnowledgeLoader, KnowledgeLoadError } from "../src/knowledge/loader.js";
import { KnowledgeValidationError, KnowledgeValidator } from "../src/knowledge/validator.js";

const validRule = {
  id: "rule.example",
  type: "rule",
  name: "示例规则",
  description: "用于测试的规则。",
  version: "1.0.0",
  status: "active",
  tags: ["测试"],
  appliesTo: ["form"],
  references: [],
  severity: "warning",
  checkType: "manual",
  assertion: { operator: "exists", path: "example" },
};

async function fixtureCatalog(entries: Array<{ path: string; value: unknown }>): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-knowledge-"));
  await writeFile(path.join(directory, "catalog.json"), JSON.stringify({
    schemaVersion: "0.5",
    version: "0.5.0",
    entries: entries.map((entry) => entry.path),
  }));
  for (const entry of entries) {
    await mkdir(path.dirname(path.join(directory, entry.path)), { recursive: true });
    await writeFile(path.join(directory, entry.path), JSON.stringify(entry.value));
  }
  return directory;
}

test("TC-050-002 默认 catalog 可加载且版本正确", async () => {
  const catalog = await new KnowledgeLoader().load();
  assert.equal(catalog.schemaVersion, "0.5");
  assert.equal(catalog.version, "0.5.0");
  assert.equal(catalog.entities.length, 21);
  assert.equal(catalog.byId.get("pattern.list-page")?.type, "pattern");
  assert.equal(catalog.byId.get("rule.required-field")?.type, "rule");
});

test("TC-050-003 知识文件缺失时返回明确错误", async () => {
  const directory = await fixtureCatalog([{ path: "rules/missing.json", value: validRule }]);
  await writeFile(path.join(directory, "catalog.json"), JSON.stringify({
    schemaVersion: "0.5", version: "0.5.0", entries: ["rules/not-found.json"],
  }));
  await assert.rejects(() => new KnowledgeLoader().load(directory), (error: unknown) => {
    assert.ok(error instanceof KnowledgeLoadError);
    assert.match(error.message, /not-found\.json/);
    return true;
  });
});

test("TC-050-004/005 缺失字段、非法类型和版本被拒绝", () => {
  const validator = new KnowledgeValidator();
  assert.throws(
    () => validator.validateEntities([{ ...validRule, name: "", type: "unknown", version: "v1" }]),
    (error: unknown) => {
      assert.ok(error instanceof KnowledgeValidationError);
      assert.match(error.message, /name 缺失或为空/);
      assert.match(error.message, /type 非法/);
      assert.match(error.message, /version 必须是语义化版本/);
      return true;
    },
  );
});

test("TC-050-006 重复知识 ID 被拒绝", () => {
  assert.throws(
    () => new KnowledgeValidator().validateEntities([validRule, { ...validRule }]),
    /知识 ID 重复：rule\.example/,
  );
});

test("TC-050-007 不存在的引用目标被拒绝", () => {
  const component = {
    ...validRule,
    id: "component.example",
    type: "component",
    references: [{ id: "rule.missing", type: "rule" }],
  };
  delete (component as Partial<typeof validRule>).severity;
  delete (component as Partial<typeof validRule>).checkType;
  delete (component as Partial<typeof validRule>).assertion;
  assert.throws(() => new KnowledgeValidator().validateEntities([component]), /引用了不存在的知识：rule\.missing/);
});

test("TC-050-008 引用目标类型不匹配时被拒绝", () => {
  const component = {
    id: "component.example", type: "component", name: "组件", description: "测试组件。",
    version: "1.0.0", status: "active", tags: [], appliesTo: [],
    references: [{ id: "rule.example", type: "component" }],
  };
  assert.throws(
    () => new KnowledgeValidator().validateEntities([component, validRule]),
    /声明为 component，实际为 rule/,
  );
});

test("KNO-004 知识关系环路被拒绝", () => {
  const a = { ...validRule, id: "rule.a", references: [{ id: "rule.b", type: "rule" }] };
  const b = { ...validRule, id: "rule.b", references: [{ id: "rule.a", type: "rule" }] };
  assert.throws(() => new KnowledgeValidator().validateEntities([a, b]), /知识引用存在环路/);
});

test("Loader 拒绝 catalog 中的越界路径", async () => {
  const directory = await fixtureCatalog([]);
  await writeFile(path.join(directory, "catalog.json"), JSON.stringify({
    schemaVersion: "0.5", version: "0.5.0", entries: ["../outside.json"],
  }));
  await assert.rejects(() => new KnowledgeLoader().load(directory), /知识文件路径越界/);
});
