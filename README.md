# DuoReady iPhone Duo compatibility preflight

DuoReady is a bounded static review of Swift source before an iPhone Duo release. It highlights code locations worth checking for fixed-screen, orientation, and safe-area assumptions. It is **not** a compiler, simulator test, device test, or compatibility certification.

The action scans files in the GitHub runner workspace. Project source is not uploaded to a DuoReady service. The generated Markdown report stays in the workflow workspace unless your workflow explicitly publishes it as an artifact.

## Quick start

```yaml
name: DuoReady review
on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: ryuamarines/duoready-action@v1
        id: duoready
        with:
          path: .
          output: duoready-report.md
          fail-on-high: 'false'
      - run: echo "Review locations: ${{ steps.duoready.outputs.findings }}"
```

Pin to a full release commit SHA for stronger supply-chain stability in production workflows. `@v1` is provided for readable examples.

## Inputs and outputs

| Input | Default | Meaning |
| --- | --- | --- |
| `path` | `.` | Directory of Swift sources in the checked-out workspace |
| `output` | `duoready-report.md` | Markdown report path, relative to workspace or absolute |
| `fail-on-high` | `false` | Exit nonzero when HIGH review locations exist |

Outputs: `report` (absolute report path), `findings`, `high`, `medium`, and `low`. A job summary also records the counts. The report is written even when `fail-on-high` fails the job.

## What it checks

- Fixed display/screen geometry assumptions.
- Symmetric safe-area inset assumptions.
- Orientation assumptions that merit a second look.

Generic safe-area handling, small fixed controls, and code in excluded generated/vendor/test paths are not reported as defects. Findings are review prompts with rule/confidence labels, not proof of an iPhone Duo bug.

## Limits and privacy

Swift text is inspected without type resolution, compiler flags, ObjC/storyboard/Info.plist analysis, or a real Duo runtime. A clean report does **not** mean the app is Duo-compatible. Complete the manual Xcode/Simulator/device acceptance for the actual target hardware before release. This Action performs no network calls; GitHub Actions infrastructure and any other steps in your workflow remain governed by your own workflow settings.

## Local verification

Requires Node.js 20 or newer. Run `npm run check && npm test`. The package has no third-party runtime dependencies.

This standalone action is extracted from the DuoReady candidate in AI Factory. The browser demo is hosted at [ryuamarines Tools](https://ryuamarines-tools.vercel.app/trends/iphone-duo/duoready/); hosting is not evidence of external adoption.
