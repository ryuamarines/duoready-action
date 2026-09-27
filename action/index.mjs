import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { scanProject, markdownReport } from "../src/scanner.mjs";

function input(name, fallback = "") {
  const key = `INPUT_${name.toUpperCase().replaceAll("-", "_")}`;
  return process.env[key] ?? fallback;
}

function outputLine(name, value) {
  return `${name}=${String(value).replaceAll("\n", "%0A")}\n`;
}

async function appendTarget(envName, content) {
  const target = process.env[envName];
  if (!target) return;
  await appendFile(target, content, "utf8");
}

const workspace = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd());
const project = path.resolve(workspace, input("path", "."));
const configuredOutput = input("output", "duoready-report.md");
const reportPath = path.isAbsolute(configuredOutput)
  ? configuredOutput
  : path.resolve(workspace, configuredOutput);
const failOnHigh = input("fail-on-high", "false").toLowerCase() === "true";

try {
  const result = await scanProject(project);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, markdownReport(result), "utf8");

  const counts = {
    high: Number(result.counts?.HIGH || 0),
    medium: Number(result.counts?.MEDIUM || 0),
    low: Number(result.counts?.LOW || 0),
  };
  const findings = result.findings.length;

  await appendTarget("GITHUB_OUTPUT",
    outputLine("report", reportPath) +
    outputLine("findings", findings) +
    outputLine("high", counts.high) +
    outputLine("medium", counts.medium) +
    outputLine("low", counts.low)
  );

  await appendTarget("GITHUB_STEP_SUMMARY",
    [
      "## DuoReady compatibility preflight",
      "",
      `Scanned **${result.files.length}** Swift files and found **${findings}** review locations.`,
      "",
      `- HIGH: ${counts.high}`,
      `- MEDIUM: ${counts.medium}`,
      `- LOW: ${counts.low}`,
      "",
      `Report: \`${reportPath}\``,
      "",
      "> Static review only. A clean report is not iPhone Duo certification; simulator/device validation remains required.",
      "",
    ].join("\n")
  );

  console.log(`DuoReady scanned ${result.files.length} Swift file(s); ${findings} finding(s). Report: ${reportPath}`);
  if (failOnHigh && counts.high > 0) {
    console.error(`DuoReady found ${counts.high} HIGH finding(s); fail-on-high is enabled.`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`DuoReady Action failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
