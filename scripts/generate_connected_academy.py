#!/usr/bin/env python3
"""Generate Amy Trading Academy's privacy-filtered connected library.

Reads only educational Markdown from the public Obsidian vault checkout. It never
opens media files and excludes personal journals, daily notes, trash and caches.
"""
from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import html
import json
import re
import shutil
import unicodedata
from pathlib import Path, PurePosixPath
from urllib.parse import quote

import mistune
import yaml
from bs4 import BeautifulSoup

MODULE_TITLES = {
    1: "Pemula Nol", 2: "Membaca Chart", 3: "Fondasi Market", 4: "Liquidity",
    5: "Smart Money Concept", 6: "ICT Core", 7: "Bias dan Top Down", 8: "Session dan Waktu",
    9: "Entry Model", 10: "XAUUSD Playbook", 11: "Advanced ICT", 12: "Risk Management",
    13: "Psikologi Trading", 14: "Backtesting dan Jurnal", 15: "Menjadi Trader Mandiri",
    16: "Advanced Market Structure Reading", 17: "Advanced Liquidity Mapping",
    18: "Advanced Sweep & Delivery Model", 19: "POI Selection Masterclass",
    20: "FVG, OB, CE & IFVG Decision Model", 21: "Session Timing Advanced",
    22: "Daily Bias & Weekly Profile Advanced", 23: "ICT Macro & Silver Bullet Model",
    24: "Opening Gap Model", 25: "Turtle Soup & Smart Money Reversal",
    26: "OTE & Standard Deviation Targeting", 27: "Intermarket & SMT Confirmation",
    28: "Advanced Entry Workflow", 29: "Trade Management Advanced",
    30: "A+ Setup Library & Full Checklist", 31: "ICT Advanced Concepts",
    32: "Trading Tools & Setup", 33: "Live Case Studies", 34: "Prop Firm Mastery",
    35: "Trading Plan Template", 36: "Psikologi ICT Lanjutan",
}

REPO_FOLDER = {
    1:"bagian-01-pemula-nol",2:"bagian-02-membaca-chart",3:"bagian-03-fondasi-market",4:"bagian-04-liquidity",
    5:"bagian-05-smart-money-concept",6:"bagian-06-ict-core",7:"bagian-07-bias-dan-top-down",8:"bagian-08-session-dan-waktu",
    9:"bagian-09-entry-model",10:"bagian-10-xauusd-playbook",11:"bagian-11-advanced-ict",12:"bagian-12-risk-management",
    13:"bagian-13-psikologi-trading",14:"bagian-14-backtesting-dan-jurnal",15:"bagian-15-menjadi-trader-mandiri",
    16:"bagian-16-advanced-entry-logic",17:"bagian-17-fvg-masterclass",18:"bagian-18-order-block-masterclass",
    19:"bagian-19-liquidity-masterclass",20:"bagian-20-idm-inducement-masterclass",21:"bagian-21-ifvg-inversion-model",
    22:"bagian-22-block-advanced",23:"bagian-23-premium-discount-advanced",24:"bagian-24-market-structure-advanced",
    25:"bagian-25-session-entry-model",26:"bagian-26-xauusd-advanced-playbook",27:"bagian-27-no-trade-advanced",
    28:"bagian-28-trade-management-advanced",29:"bagian-29-backtest-advanced",30:"bagian-30-a-plus-setup-library",
}

EXCLUDED_PREFIXES = (
    "jurnal harian/", "jurnal_lama/", "daily-brief/", ".trash/", ".smart-env/",
    "images/", "assets/images/",
)
MEDIA_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".heic", ".mp4", ".mov", ".avi", ".mkv", ".mp3", ".wav", ".m4a", ".pdf"}
CALLOUT_NAMES = {
    "info":"Informasi","tip":"Tips","warning":"Peringatan","danger":"Bahaya","note":"Catatan",
    "example":"Contoh","question":"Pertanyaan","quote":"Kutipan","success":"Poin penting",
    "failure":"Kesalahan","bug":"Catatan masalah","abstract":"Ringkasan","summary":"Ringkasan",
    "todo":"Tugas","check":"Checklist","attention":"Perhatian","important":"Penting",
}


def norm(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii")
    text = text.lower().replace("&", " dan ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", text)).strip()


def slugify(value: object) -> str:
    return (norm(value).replace(" ", "-")[:100] or "materi")


def safe_include(rel: str) -> bool:
    low = rel.lower()
    if not low.endswith(".md"):
        return False
    if re.match(r"^bagian-\d{2}-[^/]+/.+\.md$", rel, re.I):
        return True
    if low.startswith("glosarium/") or low.startswith("00-kurikulum-mulai-dari-sini/"):
        return True
    if low.startswith(".obsidian/templates/"):
        return True
    return rel in {"Amy FX Academy.md", "Killzone (Asia, London, New York).md", "🗺️ Dashboard Utama.md", "#L01f5fa#Ufe0f Dashboard Utama.md"}


def parse_frontmatter(text: str) -> tuple[dict, str]:
    if text.startswith("---\n"):
        end = text.find("\n---\n", 4)
        if end != -1:
            try:
                value = yaml.safe_load(text[4:end]) or {}
                return (value if isinstance(value, dict) else {}), text[end + 5:]
            except Exception:
                pass
    return {}, text


def title_from(rel: str, fm: dict, body: str) -> str:
    if fm.get("title"):
        return str(fm["title"]).strip()
    match = re.search(r"^#\s+(.+?)\s*$", body, re.M)
    if match:
        return re.sub(r"\[\[|\]\]", "", match.group(1)).strip()
    return PurePosixPath(rel).stem


def aliases_from(rel: str, fm: dict, title: str) -> list[str]:
    raw = fm.get("aliases")
    values = [raw] if isinstance(raw, str) else list(raw or []) if isinstance(raw, list) else []
    values += [PurePosixPath(rel).stem, title]
    result, seen = [], set()
    for value in values:
        value = str(value).strip()
        key = norm(value)
        if value and key not in seen:
            seen.add(key)
            result.append(value)
    return result


def module_for(rel: str) -> str:
    match = re.match(r"^bagian-(\d{2})-", rel, re.I)
    if match:
        return match.group(1)
    if rel.lower().startswith("glosarium/"):
        return "glosarium"
    if rel.lower().startswith(".obsidian/templates/"):
        return "template"
    if rel.lower().startswith("00-kurikulum"):
        return "00"
    return "referensi"


def module_label(module_id: str) -> str:
    if module_id.isdigit() and int(module_id) in MODULE_TITLES:
        return f"Bagian {int(module_id):02d} — {MODULE_TITLES[int(module_id)]}"
    return {"00":"Roadmap Kurikulum", "glosarium":"Glosarium", "template":"Template Latihan", "referensi":"Referensi Academy"}.get(module_id, module_id)


def strip_media_and_private_lines(body: str) -> str:
    body = re.sub(r"%%.*?%%", "", body, flags=re.S)
    output, marker_pending = [], False
    for line in body.splitlines():
        private = False
        for match in re.finditer(r"!?\[\[([^\]|#]+)", line):
            target = match.group(1).strip().lower()
            if target.startswith(EXCLUDED_PREFIXES):
                private = True
                break
        if private:
            continue
        had_media = False
        if re.search(r"!\[\[[^\]]+\]\]", line):
            had_media = True
        line = re.sub(r"!\[\[[^\]]+\]\]", "", line)
        if re.search(r"!\[[^\]]*\]\([^\)]+\)", line):
            had_media = True
        line = re.sub(r"!\[[^\]]*\]\([^\)]+\)", "", line)
        if re.search(r"<img\b[^>]*>", line, flags=re.I):
            had_media = True
        line = re.sub(r"<img\b[^>]*>", "", line, flags=re.I)
        if had_media and not line.strip():
            if not marker_pending:
                output.append("*Ilustrasi tidak disertakan.*")
                marker_pending = True
            continue
        if line.strip():
            marker_pending = False
        output.append(line)
    return "\n".join(output)


def preprocess_callouts(body: str) -> str:
    output = []
    for line in body.splitlines():
        match = re.match(r"^(\s*>\s*)\[!([A-Za-z-]+)\](?:[+-])?\s*(.*)$", line)
        if match:
            label = CALLOUT_NAMES.get(match.group(2).lower(), match.group(2).title())
            title = match.group(3).strip()
            output.append(f"{match.group(1)}**{label}{' — ' + title if title else ''}**")
        else:
            line = re.sub(r"^\s*- \[ \]\s+", "- ☐ ", line)
            line = re.sub(r"^\s*- \[[xX]\]\s+", "- ☑ ", line)
            output.append(line)
    return "\n".join(output)


def extract_tags(fm: dict, body: str) -> list[str]:
    raw = fm.get("tags")
    values = re.split(r"[,\s]+", raw) if isinstance(raw, str) else [str(v) for v in raw] if isinstance(raw, list) else []
    values += re.findall(r"(?<!\w)#([\w\-/]+)", body)
    result, seen = [], set()
    for value in values:
        value = value.strip("# ")
        if value and value.lower() not in seen:
            seen.add(value.lower())
            result.append(value)
    return result[:20]


def concept_key(title: str) -> str:
    value = re.sub(r"\b(masterclass|lanjutan|advanced|dasar|lengkap|praktis|checklist|apa itu)\b", " ", norm(title))
    return slugify(re.sub(r"\s+", " ", value).strip() or title)


def build_repo_title_map(academy: Path) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for path in academy.rglob("*.html"):
        rel = path.relative_to(academy).as_posix()
        if rel.startswith(("admin/", "connected/")):
            continue
        try:
            soup = BeautifulSoup(path.read_text("utf-8", errors="replace"), "html.parser")
            heading = soup.find("h1")
            if heading:
                result.setdefault(norm(heading.get_text(" ", strip=True)), []).append(rel)
        except Exception:
            pass
    return result


def encode_parts(output: Path, prefix: str, value: object, size: int = 8000) -> list[str]:
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()
    encoded = base64.b64encode(gzip.compress(raw, 9)).decode()
    names = []
    for offset in range(0, len(encoded), size):
        name = f"{prefix}-{len(names) + 1:02d}.b64"
        (output / name).write_text(encoded[offset:offset + size], "utf-8")
        names.append(name)
    return names


def inject_library_link(academy: Path) -> None:
    path = academy / "assets/js/main.js"
    text = path.read_text("utf-8")
    if "AMY_CONNECTED_LIBRARY_LINK_START" in text:
        return
    text += r'''

/* AMY_CONNECTED_LIBRARY_LINK_START */
(function(){
  if(window.__amyConnectedLibraryLinkLoaded)return;
  window.__amyConnectedLibraryLinkLoaded=true;
  function addLink(){
    var root=(typeof ROOT_PATH!=='undefined'?ROOT_PATH:'');
    var nav=document.getElementById('navlinks');
    if(nav&&!nav.querySelector('[data-amy-connected-library]')){
      var a=document.createElement('a');a.href=root+'connected/index.html';a.textContent='Pustaka Terhubung';
      a.setAttribute('data-amy-connected-library','1');nav.insertBefore(a,nav.querySelector('a[href*="glosarium"]')||null);
    }
    var hero=document.querySelector('.hero-actions');
    if(hero&&!hero.querySelector('[data-amy-connected-library]')){
      var b=document.createElement('a');b.className='btn';b.href='connected/index.html';b.textContent='Pustaka Terhubung';
      b.setAttribute('data-amy-connected-library','1');hero.appendChild(b);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addLink);else addLink();
})();
/* AMY_CONNECTED_LIBRARY_LINK_END */
'''
    path.write_text(text, "utf-8")


def generate(vault: Path, academy: Path) -> dict:
    entries = []
    for path in vault.rglob("*.md"):
        rel = path.relative_to(vault).as_posix()
        if not safe_include(rel):
            continue
        raw = path.read_text("utf-8", errors="replace")
        fm, body = parse_frontmatter(raw)
        title = title_from(rel, fm, body)
        entries.append({
            "rel": rel, "module": module_for(rel), "title": title,
            "aliases": aliases_from(rel, fm, title), "fm": fm,
            "body": strip_media_and_private_lines(body), "tags": extract_tags(fm, body),
        })

    id_seen = {}
    for entry in sorted(entries, key=lambda item: (item["module"], norm(item["title"]), item["rel"])):
        base = f'{entry["module"]}-{slugify(entry["title"])}'
        count = id_seen.get(base, 0) + 1
        id_seen[base] = count
        entry["id"] = base if count == 1 else f"{base}-{count}"
        entry["conceptId"] = concept_key(entry["title"])

    lookup, path_lookup = {}, {}
    for entry in entries:
        for alias in entry["aliases"]:
            lookup.setdefault(norm(alias), []).append(entry["id"])
        path_lookup[norm(entry["rel"])] = entry["id"]
        path_lookup[norm(PurePosixPath(entry["rel"]).with_suffix("").as_posix())] = entry["id"]
    by_id = {entry["id"]: entry for entry in entries}
    repo_title_map = build_repo_title_map(academy)

    def resolve(raw_target: str, current: dict):
        target = raw_target.split("#", 1)[0].strip()
        if not target:
            return None
        if target.lower().startswith(EXCLUDED_PREFIXES):
            return "PRIVATE"
        if norm(target) in path_lookup:
            return path_lookup[norm(target)]
        candidates = lookup.get(norm(PurePosixPath(target).name), []) or lookup.get(norm(target), [])
        if not candidates:
            return None
        same_module = [item for item in candidates if by_id[item]["module"] == current["module"]]
        return (same_module or candidates)[0]

    wikilink = re.compile(r"(!?)\[\[([^\]]+)\]\]")
    markdown = mistune.create_markdown(escape=True, plugins=["strikethrough", "table", "task_lists", "url"])
    for entry in entries:
        outgoing, unresolved = [], []
        def replace(match):
            embedded = match.group(1) == "!"
            inside = match.group(2)
            target, label = inside.split("|", 1) if "|" in inside else (inside, None)
            label = (label or target.split("#", 1)[0]).strip()
            resolved = resolve(target, entry)
            if resolved == "PRIVATE":
                return ""
            if resolved:
                if resolved not in outgoing:
                    outgoing.append(resolved)
                return f"[{label}](reader.html?id={quote(resolved)})"
            if not embedded:
                unresolved.append(label)
                return f"[{label}](index.html?q={quote(label)})"
            return label
        body = wikilink.sub(replace, entry["body"])
        body = preprocess_callouts(body)
        body = re.sub(r"^#\s+[^\n]+\n+", "", body, count=1)
        entry["html"] = markdown(body)
        entry["outgoing"] = outgoing
        entry["unresolved"] = list(dict.fromkeys(unresolved))[:30]
        entry["wordCount"] = len(re.findall(r"\b\w+\b", body, flags=re.UNICODE))
        old = []
        for alias in entry["aliases"]:
            old += repo_title_map.get(norm(alias), [])
        entry["academyPaths"] = list(dict.fromkeys(old))[:5]
        entry["contentHash"] = hashlib.sha256(re.sub(r"\s+", " ", body).strip().encode()).hexdigest()

    backlinks = {entry["id"]: [] for entry in entries}
    for entry in entries:
        for target in entry["outgoing"]:
            if target in backlinks and entry["id"] not in backlinks[target]:
                backlinks[target].append(entry["id"])
    for entry in entries:
        entry["backlinks"] = backlinks[entry["id"]]

    hash_groups = {}
    for entry in entries:
        hash_groups.setdefault(entry["contentHash"], []).append(entry["id"])
    for ids in hash_groups.values():
        if len(ids) > 1:
            canonical = sorted(ids)[0]
            for item in ids:
                if item != canonical:
                    by_id[item]["duplicateOf"] = canonical

    concepts = {}
    for entry in entries:
        concepts.setdefault(entry["conceptId"], []).append(entry["id"])
    for entry in entries:
        related = [item for item in concepts[entry["conceptId"]] if item != entry["id"]]
        for item in entry["outgoing"] + entry["backlinks"]:
            if item != entry["id"] and item not in related:
                related.append(item)
        entry["related"] = related[:20]

    module_order = ["00"] + [f"{number:02d}" for number in range(1, 37)] + ["glosarium", "template", "referensi"]
    grouped = {module: [] for module in module_order}
    for entry in entries:
        grouped.setdefault(entry["module"], []).append(entry)
    modules = []
    for module in module_order:
        notes = sorted(grouped.get(module, []), key=lambda item: norm(item["title"]))
        if not notes and module != "20":
            continue
        original = f'../{REPO_FOLDER[int(module)]}/index.html' if module.isdigit() and int(module) in REPO_FOLDER else None
        modules.append({
            "id": module, "title": module_label(module), "lessonCount": len(notes),
            "wordCount": sum(item["wordCount"] for item in notes), "originalPath": original,
            "description": "Materi inti Academy yang sudah ada tetap dipertahankan; versi Vault terhubung ditampilkan sebagai tambahan." if module == "20" and not notes else
                "Roadmap dan urutan pembelajaran." if module == "00" else
                "Istilah dan definisi penting." if module == "glosarium" else
                "Template latihan yang dapat digunakan ulang." if module == "template" else
                "Kumpulan materi terhubung dari Vault Obsidian yang sudah disaring.",
        })

    index_notes, body_notes = [], []
    for entry in sorted(entries, key=lambda item: (module_order.index(item["module"]) if item["module"] in module_order else 999, norm(item["title"]), item["id"])):
        meta = {
            "id": entry["id"], "module": entry["module"], "title": entry["title"], "aliases": entry["aliases"],
            "wordCount": entry["wordCount"], "academyPaths": entry["academyPaths"], "related": entry["related"],
            "backlinks": entry["backlinks"], "outgoing": entry["outgoing"], "embedded": not bool(entry["academyPaths"]),
        }
        if entry.get("duplicateOf"):
            meta["duplicateOf"] = entry["duplicateOf"]
        index_notes.append(meta)
        if not entry["academyPaths"]:
            body = {"id": entry["id"], "html": entry["html"]}
            if entry.get("duplicateOf"):
                body["duplicateOf"] = entry["duplicateOf"]
            body_notes.append(body)

    meta_object = {
        "modules": modules,
        "stats": {
            "notes": len(entries), "modules": len(modules), "words": sum(item["wordCount"] for item in entries),
            "resolvedLinks": sum(len(item["outgoing"]) for item in entries),
            "unresolvedLinks": sum(len(item["unresolved"]) for item in entries),
            "exactDuplicatePlacements": sum(max(0, len(value) - 1) for value in hash_groups.values()),
            "repoMatches": sum(1 for item in entries if item["academyPaths"]),
        },
        "notes": index_notes,
    }
    body_object = {"notes": body_notes}

    output = academy / "connected/data"
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    meta_parts = encode_parts(output, "meta", meta_object)
    body_parts = encode_parts(output, "body", body_object)
    (output / "manifest.json").write_text(json.dumps({"meta": meta_parts, "body": body_parts, "version": 1}, separators=(",", ":")), "utf-8")

    inject_library_link(academy)

    all_json = json.dumps(meta_object, ensure_ascii=False) + json.dumps(body_object, ensure_ascii=False)
    forbidden = ["Jurnal_Lama/", "Daily-Brief/", ".trash/", ".smart-env/", "<img", "images/"]
    for value in forbidden:
        if value.lower() in all_json.lower():
            raise RuntimeError(f"Privacy validation failed: {value}")
    if len(entries) < 500:
        raise RuntimeError(f"Only {len(entries)} educational notes were generated; expected at least 500")
    return meta_object["stats"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vault", required=True, type=Path)
    parser.add_argument("--academy", required=True, type=Path)
    args = parser.parse_args()
    stats = generate(args.vault.resolve(), args.academy.resolve())
    print(json.dumps(stats, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
