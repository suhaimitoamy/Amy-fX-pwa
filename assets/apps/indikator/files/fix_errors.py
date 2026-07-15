import re

def process_file(filepath):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
    except FileNotFoundError:
        print(f"File {filepath} not found.")
        return

    # A. Ubah semua kondisi pivot:
    content = re.sub(r'\bif\s+ph\b', 'if not na(ph)', content)
    content = re.sub(r'\bif\s+pl\b', 'if not na(pl)', content)

    # B. Ubah dayofweek
    content = content.replace("if ta.change(dayofweek)", "if ta.change(dayofweek) != 0")

    # C. Killzones
    # We want to match: ny = time(...) and showNy
    # and replace with: ny = not na(time(...)) and showNy
    # A generic regex for these four variables: ny, ldn_open, ldn_close, asian
    
    # Let's find patterns like:  varname = time( ... ) and showVar
    # Since `time(...)` can have nested parentheses, we use a trick: match up to `) and show`
    # Replace `ny = time(X) and showNy` -> `ny = not na(time(X)) and showNy`
    
    def fix_killzone(match):
        var_name = match.group(1)
        time_inner = match.group(2)
        show_var = match.group(3)
        return f"{var_name} = not na(time({time_inner})) and {show_var}"
        
    content = re.sub(r'\b(ny|ldn_open|ldn_close|asian)\s*=\s*time\((.*?)\)\s*and\s*(showNy|showLdno|showLdnc|showAsia)\b', fix_killzone, content)

    # D. Tambahkan definisi Asia High dan Asia Low
    asia_block = """
amyKeyV2_asiaSession = not na(time(timeframe.period, "1000-1400", "Asia/Tokyo"))

var float amyKeyV2_asiaHigh = na
var float amyKeyV2_asiaLow = na

if amyKeyV2_asiaSession and not amyKeyV2_asiaSession[1]
    amyKeyV2_asiaHigh := high
    amyKeyV2_asiaLow := low
else if amyKeyV2_asiaSession
    amyKeyV2_asiaHigh := math.max(amyKeyV2_asiaHigh, high)
    amyKeyV2_asiaLow := math.min(amyKeyV2_asiaLow, low)
"""
    # Insert after amyKeyV2_midnightOpen = na(amyKeyV2_moFixed) ? amyKeyV2_moFallback : amyKeyV2_moFixed
    target_line = r'(amyKeyV2_midnightOpen\s*=\s*na\(amyKeyV2_moFixed\)\s*\?\s*amyKeyV2_moFallback\s*:\s*amyKeyV2_moFixed)'
    
    if "amyKeyV2_asiaHigh = na" not in content:
        content = re.sub(target_line, r'\1\n' + asia_block, content)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Fixed {filepath}")

process_file("ICT yang di sempurnakan edited.pine")
process_file("AMY_Ultimate_Professional_Suite.pine")

