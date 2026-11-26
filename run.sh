#!/usr/bin/env bash
set -euo pipefail

if [[ ${1:-} == --help || ${1:-} == -h ]]; then
  cat <<'EOF'
Usage: ./run.sh [Next.js dev options]

Installs dependencies from the pnpm lockfile and starts the development server.
Example: ./run.sh --port 3001
EOF
  exit 0
fi

CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if ! command -v node >/dev/null 2>&1 || ! node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  process.exit(major > 22 || (major === 22 && minor >= 9) ? 0 : 1);
'; then
  echo 'BrewBot requires Node.js 22.9.0 or newer.' >&2
  exit 1
fi

package_manager=$(node -p 'require("./package.json").packageManager')
if command -v pnpm >/dev/null 2>&1 && [[ $(pnpm --version 2>/dev/null) == "${package_manager#pnpm@}" ]]; then
  pnpm_command=(pnpm)
elif command -v npm >/dev/null 2>&1; then
  pnpm_command=(npm exec --yes --package="$package_manager" -- pnpm)
else
  echo "Install $package_manager or make npm available to run BrewBot." >&2
  exit 1
fi

"${pnpm_command[@]}" install --frozen-lockfile
exec "${pnpm_command[@]}" run dev "$@"
