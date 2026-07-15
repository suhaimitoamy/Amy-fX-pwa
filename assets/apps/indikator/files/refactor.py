import re

with open("ICT yang di sempurnakan", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Fix default visual clutters
content = re.sub(r'(showMS\s*=\s*input\.bool\s*\(\s*)true', r'\g<1>false', content)
content = re.sub(r'(showOB\s*=\s*input\.bool\s*\(\s*)true', r'\g<1>false', content)
content = re.sub(r'(showLq\s*=\s*input\.bool\s*\(\s*)true', r'\g<1>false', content)
content = re.sub(r'(shwFVG\s*=\s*input\.bool\s*\(\s*)true', r'\g<1>false', content)
content = re.sub(r'(iNWOG\s*=\s*input\.bool\s*\(\s*)true', r'\g<1>false', content)

# 2. Fix the Dashboard Freeze
old_dash_vars = """    _o = open[1]
    _h = high[1]
    _l = low[1]
    _c = close[1]
    _pc = close[2]"""

new_dash_vars = """    _o = open
    _h = high
    _l = low
    _c = close
    _pc = close[1]"""

if old_dash_vars in content:
    content = content.replace(old_dash_vars, new_dash_vars)
else:
    print("Warning: old dash vars not found")

# 3. Read Potongan pivot 4
with open("Potongan pivot 4", "r", encoding="utf-8") as f:
    pivot4 = f.read()

# Update defaults in Pivot4
pivot4 = re.sub(r'(amyPivotV2_show\s*=\s*input\.bool\()true', r'\g<1>false', pivot4)
pivot4 = re.sub(r'(amyKeyV2_show\s*=\s*input\.bool\()true', r'\g<1>false', pivot4)

# 4. Replace Pivot section
# We need to find from //==================== AMY PIVOT V2 ====================//
# down to the line just before amyDashV2_group = "AMY Dashboard Bias V2"

pattern = r'//==================== AMY PIVOT V2 ====================//.*?(\namyDashV2_group = "AMY Dashboard Bias V2")'
match = re.search(pattern, content, re.DOTALL)
if match:
    # the replacement string is pivot4 + "\n\n" + match.group(1)
    # wait, pivot4 might not end with a newline
    new_section = pivot4.strip() + "\n\n" + match.group(1).lstrip()
    content = content[:match.start()] + new_section + content[match.end():]
else:
    print("Warning: Pivot section not found")

# 5. Add headers for monolithic code
# Add some spacing around //====================
content = re.sub(r'(//==================== AMY PIVOT V2 ====================//)', r'\n\n\1', content)
content = re.sub(r'(//==================== AMY KEY LEVELS V2 ====================//)', r'\n\n\1', content)
content = re.sub(r'(amyDashV2_group = "AMY Dashboard Bias V2")', r'//==================== AMY DASHBOARD BIAS V2 ====================//\n\n\1', content)

with open("ICT yang di sempurnakan edited.pine", "w", encoding="utf-8") as f:
    f.write(content)

print("Refactor completed successfully.")
