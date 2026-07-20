#!/usr/bin/env bash
set -e
mkdir -p app/src/main/assets/apps/mapping
cp amyfx_indicator_logic_patch/app/src/main/assets/apps/mapping/index.html app/src/main/assets/apps/mapping/index.html
cp amyfx_indicator_logic_patch/INDICATOR_LOGIC_PORT_NOTES.md ./INDICATOR_LOGIC_PORT_NOTES.md
if [ -f app/build.gradle.kts ]; then
  python3 - <<'PY'
from pathlib import Path
p=Path('app/build.gradle.kts')
s=p.read_text()
import re
m=re.search(r'versionCode\s*=\s*(\d+)', s)
if m:
    n=int(m.group(1))+1
    s=re.sub(r'versionCode\s*=\s*\d+', f'versionCode = {n}', s, count=1)
    vm=re.search(r'versionName\s*=\s*"([0-9]+)\.([0-9]+)"', s)
    if vm:
        major=int(vm.group(1)); minor=int(vm.group(2))+1
        s=re.sub(r'versionName\s*=\s*"[0-9]+\.[0-9]+"', f'versionName = "{major}.{minor}"', s, count=1)
    p.write_text(s)
PY
fi
