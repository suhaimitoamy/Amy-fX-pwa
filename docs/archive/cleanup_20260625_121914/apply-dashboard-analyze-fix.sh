#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
MAPPING="$ROOT/app/src/main/assets/apps/mapping/index.html"
GRADLE="$ROOT/app/build.gradle.kts"
NOTES="$ROOT/DASHBOARD_ANALYZE_FIX_NOTES.md"

if [ ! -f "$MAPPING" ]; then
  echo "ERROR: mapping index.html tidak ditemukan: $MAPPING" >&2
  exit 1
fi

python3 - <<'PY'
from pathlib import Path
import re

mapping = Path('app/src/main/assets/apps/mapping/index.html')
text = mapping.read_text(encoding='utf-8')
old = "${renderContext(r)}<section class=\"card\"><h2>ICT Concepts Covered</h2>"
new = "<section class=\"card\"><h2>ICT Concepts Covered</h2>"
if old in text:
    text = text.replace(old, new, 1)
else:
    text2 = re.sub(r"\$\{renderContext\(r\)\}(?=<section class=\"card\"><h2>ICT Concepts Covered</h2>)", "", text, count=1)
    if text2 == text:
        raise SystemExit('ERROR: pola renderContext dashboard tidak ditemukan. Patch tidak diterapkan.')
    text = text2

# Tambahkan penanda kecil agar tidak membingungkan audit berikutnya.
marker = "/* dashboard_no_analyze_context */"
if marker not in text:
    text = text.replace("function dashboard(){", marker + "\nfunction dashboard(){", 1)

mapping.write_text(text, encoding='utf-8')

# Naikkan versionCode agar APK update bisa terpasang di atas build lama.
gradle = Path('app/build.gradle.kts')
if gradle.exists():
    g = gradle.read_text(encoding='utf-8')
    g = re.sub(r'versionCode\s*=\s*\d+', 'versionCode = 7', g, count=1)
    g = re.sub(r'versionName\s*=\s*"[^"]+"', 'versionName = "1.6"', g, count=1)
    gradle.write_text(g, encoding='utf-8')
PY

cat > "$NOTES" <<'MD'
# Dashboard Analyze Fix

Perbaikan:
- Menghapus `renderContext(r)` dari Dashboard Mapping.
- Market Context / fitur Analyze sekarang hanya tampil di tab Analyze.
- Dashboard tetap menampilkan ringkasan, tombol masuk Analyze, dan ICT Concepts.
- Version APK dinaikkan ke 1.6 / versionCode 7.
MD

echo "OK: Dashboard tidak lagi menampilkan panel Analyze."
