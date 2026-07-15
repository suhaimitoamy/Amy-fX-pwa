import os
import re
from pathlib import Path
from openai import OpenAI

API_KEY = os.environ["GROQ_API_KEY"]
INPUT_FILE = os.environ["INPUT_FILE"].strip()
MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile").strip()

if not INPUT_FILE:
    raise SystemExit("INPUT_FILE kosong.")

input_path = Path(INPUT_FILE)
if not input_path.exists():
    raise SystemExit(f"File input tidak ditemukan: {INPUT_FILE}")

source_code = input_path.read_text(encoding="utf-8", errors="ignore")

version_match = re.search(r"//@version=(\d+)", source_code)
if not version_match:
    raise SystemExit("Versi Pine tidak ditemukan di file.")

source_version = int(version_match.group(1))
if source_version < 5:
    raise SystemExit(
        f"File ini versi v{source_version}. Workflow ini khusus untuk review/refactor v5/v6."
    )

review_dir = Path("reviews")
review_dir.mkdir(parents=True, exist_ok=True)

improved_path = input_path.with_name(f"{input_path.stem}_improved{input_path.suffix}")
review_path = review_dir / f"{input_path.stem}_review.md"

client = OpenAI(
    api_key=API_KEY,
    base_url="https://api.groq.com/openai/v1",
)

system_prompt = """You are an expert Pine Script reviewer and refactoring assistant.

Your task:
- Review Pine Script v5/v6 code.
- Keep the same Pine version as the source unless absolutely necessary.
- Never downgrade the Pine version.
- Preserve trading logic and behavior as closely as possible.
- Do not remove key features like alerts, entries, exits, session logic, or visuals unless clearly broken.
- Improve readability, structure, naming consistency, safety comments, and minor maintainability issues.
- Be careful around repaint-sensitive logic, request.security, lookahead usage, and strategy execution logic.
- If a risky behavior should not be changed automatically, mention it in the review and keep behavior intact.

Return EXACTLY in this format:

===REVIEW===
(markdown review here)

===CODE===
(full improved pine code here, no markdown fences)
"""

user_prompt = f"""Review and improve this Pine Script file.

Source file: {INPUT_FILE}
Detected version: v{source_version}

What to review:
- repaint risk
- request.security / lookahead usage
- duplicated logic
- readability and structure
- maintainability
- variable naming
- comments
- safety of strategy logic
- anything suspicious or fragile

What to output:
1. A concise markdown review.
2. An improved version of the code that keeps the same behavior as much as possible.

SOURCE CODE:
{source_code}
"""

response = client.chat.completions.create(
    model=MODEL,
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ],
    temperature=0.2,
)

content = response.choices[0].message.content.strip()

if "===REVIEW===" not in content or "===CODE===" not in content:
    raw_path = review_dir / f"{input_path.stem}_raw_response.txt"
    raw_path.write_text(content, encoding="utf-8")
    raise SystemExit(
        f"Format respons model tidak sesuai. Raw response disimpan di: {raw_path}"
    )

review_part = content.split("===REVIEW===", 1)[1].split("===CODE===", 1)[0].strip()
code_part = content.split("===CODE===", 1)[1].strip()

if code_part.startswith("```"):
    lines = code_part.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    code_part = "\n".join(lines).strip()

improved_path.write_text(code_part + "\n", encoding="utf-8")
review_path.write_text(review_part + "\n", encoding="utf-8")

summary = f"""# Pine Review Complete

- Input: `{INPUT_FILE}`
- Detected version: `v{source_version}`
- Review file: `{review_path.as_posix()}`
- Improved file: `{improved_path.as_posix()}`
"""

github_step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
if github_step_summary:
    with open(github_step_summary, "a", encoding="utf-8") as f:
        f.write(summary)

print(f"Review saved to: {review_path}")
print(f"Improved code saved to: {improved_path}")
