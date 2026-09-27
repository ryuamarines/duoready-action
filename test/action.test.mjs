import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const action = path.resolve("action/index.mjs");
const fixture = path.resolve("test/fixtures");

test("GitHub Action writes report and bounded outputs", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "duoready-action-"));
  const outputs = path.join(temp, "outputs.txt");
  const summary = path.join(temp, "summary.md");
  const report = path.join(temp, "report.md");
  const run = spawnSync(process.execPath, [action], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_WORKSPACE: process.cwd(),
      GITHUB_OUTPUT: outputs,
      GITHUB_STEP_SUMMARY: summary,
      INPUT_PATH: fixture,
      INPUT_OUTPUT: report,
      INPUT_FAIL_ON_HIGH: "false",
    },
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(await readFile(outputs, "utf8"), /findings=3/);
  assert.match(await readFile(outputs, "utf8"), /high=1/);
  assert.match(await readFile(summary, "utf8"), /Static review only/);
  assert.match(await readFile(report, "utf8"), /DuoReady compatibility preflight/);
});

test("GitHub Action can fail on HIGH findings without suppressing report", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "duoready-action-high-"));
  const report = path.join(temp, "report.md");
  const run = spawnSync(process.execPath, [action], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_WORKSPACE: process.cwd(),
      INPUT_PATH: fixture,
      INPUT_OUTPUT: report,
      INPUT_FAIL_ON_HIGH: "true",
    },
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /fail-on-high/);
  assert.match(await readFile(report, "utf8"), /HIGH \/ HIGH confidence/);
});
