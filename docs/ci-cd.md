# CI/CD Integration Guide

Octate is designed for zero-friction integration into automated pull request and build pipelines. In non-TTY environments (or when `CI=true` is set), Octate automatically runs in headless mode without terminal UI overhead.

---

## GitHub Actions Workflow with SARIF Upload

Integrate Octate directly with GitHub Code Scanning alerts using the standard `upload-sarif` action:

```yaml
name: Octate AI Code Review

on:
  pull_request:
    branches: [ main, master ]
  push:
    branches: [ main, master ]

permissions:
  contents: read
  security-events: write

jobs:
  review:
    name: Run Octate Review
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Fetch complete history for accurate git diff resolution

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install Octate
        run: npm install -g octate

      - name: Run Diagnostics
        run: octate doctor --quiet
        env:
          NVIDIA_API_KEY: ${{ secrets.NVIDIA_API_KEY }}

      - name: Run Review & Export SARIF
        run: |
          octate review --range origin/${{ github.base_ref }}..HEAD \
            --sarif \
            --no-tui \
            --fail-on high > octate-findings.sarif
        env:
          NVIDIA_API_KEY: ${{ secrets.NVIDIA_API_KEY }}

      - name: Upload SARIF to GitHub Code Scanning
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: octate-findings.sarif
          category: octate-review
```

---

## Exit Code Policy in CI

Octate returns deterministic status codes:

- `0`: Success. Either no issues were detected, or all detected issues were below the `--fail-on` severity threshold.
- `1`: Blocking findings detected. At least one unsuppressed finding met or exceeded the `--fail-on` threshold.
- `2`: Configuration or schema error (`octate.yaml` validation failure).
- `3`: Repository or Git error (dirty state or unresolvable revision range).
- `4`: Model provider connectivity or authentication error.
- `5`: Internal application error.

---

## GitLab CI / Generic Shell Pipelines

For GitLab CI, Bitbucket Pipelines, or Jenkins:

```bash
# JSON output for custom downstream processing
octate review --branch origin/main --json --no-tui --output octate-results.json

# Plain text summary for build log readability
octate review --branch origin/main --quiet --no-tui
```
