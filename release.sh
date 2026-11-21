#!/usr/bin/env bash
# Build a Chrome Web Store package from the current source.
#
# Usage: ./release.sh
# Runs the unit tests and writes dist/traveler-<version>.zip containing exactly
# the runtime files (manifest, icon PNGs, src).
set -euo pipefail

cd "$(dirname "$0")"

VERSION=$(node -p "require('./extension/manifest.json').version")
OUT="$PWD/dist/traveler-${VERSION}.zip"

echo "Running tests..."
npm test

echo "Packaging dist/traveler-${VERSION}.zip ..."
mkdir -p dist
rm -f "$OUT"

python3 - "$OUT" <<'PY'
import os, sys, zipfile

out = sys.argv[1]
os.chdir("extension")

def keep(path):
    parts = path.split(os.sep)
    if any(p.startswith(".") for p in parts):
        return False
    if path.endswith(".DS_Store"):
        return False
    if parts[0] == "icons" and not path.endswith(".png"):
        return False
    return True

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.write("manifest.json")
    for top in ("icons", "src"):
        for root, dirs, files in os.walk(top):
            dirs[:] = sorted(d for d in dirs if not d.startswith("."))
            for f in sorted(files):
                p = os.path.join(root, f)
                if keep(p):
                    z.write(p)
PY

echo "Built dist/traveler-${VERSION}.zip"
python3 -c "import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); print(f'{len(z.namelist())} files, {sum(i.file_size for i in z.infolist())} bytes uncompressed')" "$OUT"
