const SKIPPED_DIRECTORIES = new Set([
  ".git", ".build", "build", "DerivedData", ".swiftpm", "Pods", "Carthage",
  "SourcePackages", "vendor", "Vendor", "node_modules", "Generated", "generated", "Tests", "UITests", "Snapshots", "__Snapshots__", "tvOS", "macOS", "tvOSCaseStudies",
]);

// Evidence and retired rules: RULE_REVIEW.md (2026-09-22).
// DETERMINISTIC describes a source pattern, never a confirmed runtime defect.
export const RULES = [
  {
    id: "UIScreen.main",
    pattern: /\bUIScreen\s*\.\s*main\b/g,
    severity: "MEDIUM", confidence: "HIGH", kind: "DETERMINISTIC",
    reason: "A global screen reference may disagree with the current window or display. A match is a review location, not a proven defect.",
    direction: "For layout use container bounds; for a screen use window.windowScene.screen; for image scale consider traitCollection.displayScale. Check fallback and cached values during transitions.",
  },
  {
    id: "orientation-driven-layout",
    pattern: /\b(?:UIDevice\s*\.\s*current\s*\.\s*orientation|(?:interfaceOrientation|statusBarOrientation)\s*\.\s*(?:isPortrait|isLandscape))\b/g,
    severity: "LOW", confidence: "MEDIUM", kind: "HEURISTIC",
    reason: "Physical or interface orientation is not available container size. Camera/recording rotation can legitimately use orientation.",
    direction: "Review layout branches for size-class or geometry inputs. Keep legitimate camera orientation handling and verify it at runtime.",
  },
  {
    id: "symmetric-safe-area-assumption",
    pattern: /(?:safeAreaInsets\s*\.\s*(left|right)\b\s*[+-]\s*(?:[A-Za-z_$][\w$]*\s*\??\.\s*)*safeAreaInsets\s*\.\s*\1\b|safeAreaInsets\s*\.\s*(?:left|right)\b\s*\*\s*2(?:\.0)?\b|\b2(?:\.0)?\s*\*\s*(?:[A-Za-z_$][\w$]*\s*\??\.\s*)*safeAreaInsets\s*\.\s*(?:left|right)\b)/g,
    severity: "HIGH", confidence: "HIGH", kind: "DETERMINISTIC",
    reason: "Doubling one horizontal safe-area inset can incorrectly assume equal opposite insets.",
    direction: "Check that both sides are intended. Subtract left and right independently or inset the bounds; test Split View on both sides.",
  },
];

export const MANUAL_CHECKLIST = [
  "Open the app in Xcode 27.1 Device Hub on both iPhone Duo displays.",
  "Exercise launch, resizing, display transitions, Split View, and state restoration.",
  "Inspect leading and trailing safe areas independently near reserved regions and custom bars.",
  "Verify navigation, sheets, keyboards, and custom edge-to-edge UI in each pose.",
  "Review large fixed container dimensions and idiom-based branches manually; fixed icon sizes and full-bleed backgrounds are often correct.",
  "Check SDK, Info.plist, state restoration and scene activation errors; Swift-only lexical scanning does not inspect these.",
  "For pose-specific UI use current reserved-region and arrangement guidance, not hinge-angle thresholds for layout.",
];

export function shouldSkipDirectory(name) {
  return SKIPPED_DIRECTORIES.has(name) || name.startsWith(".");
}

export function shouldScanPath(filePath) {
  if (!filePath || !filePath.toLowerCase().endsWith(".swift")) return false;
  if (/(?:\.generated|\.g|[-.]tvos|[-.]macos)\.swift$/i.test(filePath)) return false;
  return !filePath.replaceAll("\\", "/").split("/").some((segment) =>
    shouldSkipDirectory(segment)
  );
}

export function maskNonCode(source) {
  let output = "";
  let mode = "code";
  let blockDepth = 0;
  let stringHashes = 0;
  let tripleString = false;

  const hashesBeforeQuote = (index) => {
    let count = 0;
    while (source[index + count] === "#") count += 1;
    return count;
  };

  const closesString = (index) => {
    const quote = tripleString ? '\"\"\"' : '\"';
    if (!source.startsWith(quote, index)) return 0;
    const hashStart = index + quote.length;
    if (source.slice(hashStart, hashStart + stringHashes) !== "#".repeat(stringHashes)) return 0;
    return quote.length + stringHashes;
  };

  for (let index = 0; index < source.length;) {
    const char = source[index];
    const next = source[index + 1];

    if (mode === "line-comment") {
      output += char === "\n" ? "\n" : " ";
      if (char === "\n") mode = "code";
      index += 1;
      continue;
    }

    if (mode === "block-comment") {
      if (char === "/" && next === "*") {
        output += "  ";
        blockDepth += 1;
        index += 2;
      } else if (char === "*" && next === "/") {
        output += "  ";
        blockDepth -= 1;
        index += 2;
        if (blockDepth === 0) mode = "code";
      } else {
        output += char === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }

    if (mode === "string") {
      const closeLength = closesString(index);
      if (closeLength) {
        output += " ".repeat(closeLength);
        index += closeLength;
        mode = "code";
        continue;
      }
      if (!tripleString && stringHashes === 0 && char === "\\") {
        output += index + 1 < source.length ? "  " : " ";
        index += Math.min(2, source.length - index);
        continue;
      }
      output += char === "\n" ? "\n" : " ";
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      output += "  ";
      mode = "line-comment";
      index += 2;
      continue;
    }
    if (char === "/" && next === "*") {
      output += "  ";
      mode = "block-comment";
      blockDepth = 1;
      index += 2;
      continue;
    }

    const hashCount = hashesBeforeQuote(index);
    const quoteIndex = index + hashCount;
    if (source.startsWith('\"\"\"', quoteIndex) || source[quoteIndex] === '\"') {
      tripleString = source.startsWith('\"\"\"', quoteIndex);
      stringHashes = hashCount;
      const openLength = hashCount + (tripleString ? 3 : 1);
      output += " ".repeat(openLength);
      index += openLength;
      mode = "string";
      continue;
    }

    output += char;
    index += 1;
  }

  return output;
}

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function sourceLine(source, line) {
  return source.split("\n")[line - 1]?.trim() ?? "";
}

export function scanSource(relativePath, source) {
  if (/^\s*(?:\/\/|\/\*)[^\n]*(?:@generated|automatically generated|generated by|do not edit)/im.test(source.slice(0, 1500))) return [];
  const masked = maskNonCode(source.replaceAll("\r\n", "\n"));
  const normalized = source.replaceAll("\r\n", "\n");
  const findings = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (let match = rule.pattern.exec(masked); match; match = rule.pattern.exec(masked)) {
      const line = lineNumber(masked, match.index);
      if (findings.some(f => f.rule === rule.id && f.line === line)) continue;
      findings.push({
        rule: rule.id,
        severity: rule.id === "UIScreen.main" && /^\s*\.\s*(?:scale|nativeScale)\b/.test(masked.slice(match.index + match[0].length)) ? "LOW" : rule.severity,
        confidence: rule.confidence,
        kind: rule.kind,
        file: relativePath,
        line,
        match: sourceLine(normalized, line),
        reason: rule.reason,
        direction: rule.direction,
      });
    }
  }
  return findings;
}

export function scanFiles(files, rootName = "Selected project") {
  const scannable = files.filter((file) => shouldScanPath(file.path)).sort((a, b) => a.path.localeCompare(b.path));
  if (scannable.length === 0) throw new Error("No scannable Swift files were found.");
  const findings = scannable.flatMap((file) => scanSource(file.path, file.text));
  findings.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.rule.localeCompare(right.rule));
  const counts = Object.fromEntries(["HIGH", "MEDIUM", "LOW"].map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length]));
  return {
    rootName,
    files: scannable.map((file) => file.path),
    scannedFileCount: scannable.length,
    findings,
    counts,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('\"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function markdownReport(result) {
  const counts = result.counts ?? Object.groupBy(result.findings, (finding) => finding.severity);
  const count = (severity) => Array.isArray(counts[severity]) ? counts[severity].length : (counts[severity] ?? 0);
  const lines = [
    "# DuoReady compatibility preflight",
    "",
    "> This is a static compatibility preflight, not iPhone Duo certification. Pattern confidence is not defect confidence. Static analysis cannot prove layout correctness across Duo poses or Split View. Follow current Apple guidance and complete simulator/device testing.",
    "",
    "## Summary",
    "",
    `- Scanned files: ${result.files.length}`,
    `- Findings: ${result.findings.length}`,
    `- HIGH: ${count("HIGH")}; MEDIUM: ${count("MEDIUM")}; LOW: ${count("LOW")}`,
    "- Source processing: local only; this report does not upload project source.",
    "",
    "## Findings",
    "",
  ];
  if (result.findings.length === 0) lines.push("No supported patterns were found. This is not proof of iPhone Duo compatibility.", "");
  for (const finding of result.findings) {
    lines.push(
      `### ${finding.severity} / ${finding.confidence} confidence - ${finding.rule}`,
      "",
      `- Classification: ${finding.kind}`,
      `- Location: \`${finding.file}:${finding.line}\``,
      `- Matched code: \`${finding.match.replace(/`/g, "\\`")}\``,
      `- Why review: ${finding.reason}`,
      `- Review direction: ${finding.direction}`,
      "",
    );
  }
  lines.push(
    "## Manual Simulator Checklist",
    "",
    ...MANUAL_CHECKLIST.map((item) => `- [ ] ${item}`),
    "",
    "## Scanned files",
    "",
    ...result.files.map((file) => `- \`${file}\``),
    "",
  );
  return lines.join("\n");
}

export function htmlReport(result) {
  const cards = result.findings.length
    ? result.findings.map((finding) => `\n<article class="finding"><div class="meta"><strong>${escapeHtml(finding.rule)}</strong><span>${escapeHtml(finding.severity)}</span><span>${escapeHtml(finding.kind)}</span><span>${escapeHtml(finding.confidence)} confidence</span></div><p class="location">${escapeHtml(finding.file)}:${finding.line}</p><pre><code>${escapeHtml(finding.match)}</code></pre><p><strong>Why review:</strong> ${escapeHtml(finding.reason)}</p><p><strong>Review direction:</strong> ${escapeHtml(finding.direction)}</p></article>`).join("\n")
    : "<p>No supported patterns were found. This is not proof of iPhone Duo compatibility.</p>";
  const checklist = MANUAL_CHECKLIST.map((item) => `<li>☐ ${escapeHtml(item)}</li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DuoReady report</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:980px;margin:40px auto;padding:0 20px;color:#171717;background:#fafafa}.finding,.note{margin:18px 0;padding:20px;border:1px solid #d4d4d4;border-radius:14px;background:white}.meta{display:flex;gap:8px;flex-wrap:wrap}.meta>*{padding:3px 8px;border:1px solid #d4d4d4;border-radius:999px}.location{font-family:ui-monospace,monospace;color:#525252}pre{overflow:auto;background:#171717;color:#f5f5f5;padding:14px;border-radius:10px}</style></head><body><h1>DuoReady compatibility preflight</h1><p>${escapeHtml(result.rootName ?? "Selected project")} · ${result.files.length} Swift files · ${result.findings.length} findings</p><p class="note"><strong>Not certification.</strong> Static analysis cannot prove iPhone Duo layout correctness. Simulator/device testing remains required.</p>${cards}<h2>Manual Simulator Checklist</h2><ul>${checklist}</ul><p>Generated locally. No source upload is required by DuoReady v0.1.</p></body></html>`;
}
