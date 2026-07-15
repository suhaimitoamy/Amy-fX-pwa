import os
from pathlib import Path
from openai import OpenAI

API_KEY = os.environ["GROQ_API_KEY"]
INPUT_FILE = os.environ["INPUT_FILE"].strip()
OUTPUT_FILE = os.environ.get("OUTPUT_FILE", "").strip()

if not INPUT_FILE:
    raise SystemExit("INPUT_FILE kosong.")

input_path = Path(INPUT_FILE)
if not input_path.exists():
    raise SystemExit(f"File input tidak ditemukan: {INPUT_FILE}")

if not OUTPUT_FILE:
    if input_path.suffix:
        OUTPUT_FILE = str(input_path.with_name(f"{input_path.stem}_v4{input_path.suffix}"))
    else:
        OUTPUT_FILE = str(input_path.with_name(f"{input_path.name}_v4.pine"))

output_path = Path(OUTPUT_FILE)
output_path.parent.mkdir(parents=True, exist_ok=True)

source_code = input_path.read_text(encoding="utf-8", errors="ignore")

client = OpenAI(
    api_key=API_KEY,
    base_url="https://api.groq.com/openai/v1",
)

system_prompt = """You are an expert Pine Script migration assistant.
Convert Pine Script v3 code to Pine Script v4.

Rules:
- Keep behavior as close as possible to the original.
- Output valid Pine Script v4 code only.
- Do not include markdown fences.
"""

user_prompt = f"""Convert this Pine Script v3 code to Pine Script v4.

Return code only.

SOURCE FILE: {INPUT_FILE}

CODE:
{source_code}
"""

response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ],
    temperature=0.2,
)

content = response.choices[0].message.content.strip()

if content.startswith("```"):
    lines = content.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    content = "\n".join(lines).strip()

output_path.write_text(content + "\n", encoding="utf-8")

print(f"Saved converted file to: {OUTPUT_FILE}")
