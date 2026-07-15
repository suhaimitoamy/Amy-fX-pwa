import re

# Read base file
with open("AMY_PRO_Clean_SD_SNR_Fibo_Scalping_Engine_NoWarning.pine.txt", "r", encoding="utf-8") as f:
    base = f.read()

# Change indicator name
base = re.sub(r'indicator\("AMY PRO Clean SD SNR Fibo Scalping Engine"', r'indicator("AMY Ultimate Professional Suite"', base)
base = re.sub(r'shorttitle="AMY PRO Clean"', r'shorttitle="AMY Ultimate"', base)

# Read pivot
with open("Potongan pivot 4", "r", encoding="utf-8") as f:
    pivot = f.read()
pivot = re.sub(r'(amyPivotV2_show\s*=\s*input\.bool\()true', r'\g<1>false', pivot)
pivot = re.sub(r'(amyKeyV2_show\s*=\s*input\.bool\()true', r'\g<1>false', pivot)

# Read dashboard from edited ICT file
with open("ICT yang di sempurnakan edited.pine", "r", encoding="utf-8") as f:
    ict = f.read()

dash_pattern = r'(//==================== AMY DASHBOARD BIAS V2 ====================//.*?)//==================== AMY ENTRY ASSISTANT V2'
dash_match = re.search(dash_pattern, ict, re.DOTALL)
if dash_match:
    dash = dash_match.group(1).strip()
else:
    print("Warning: Dashboard not found")
    dash = ""

# Assemble
ultimate = base + "\n\n" + pivot + "\n\n" + dash

# Make sure all defaults except Dashboard are disabled or clean
ultimate = re.sub(r'(amy_showZones\s*=\s*input\.bool\()true', r'\g<1>false', ultimate)
ultimate = re.sub(r'(amy_showSnr\s*=\s*input\.bool\()true', r'\g<1>false', ultimate)
ultimate = re.sub(r'(amy_showFibo\s*=\s*input\.bool\()true', r'\g<1>false', ultimate)
# Dashboard remains true
# Entry lines remains true because it's only shown on signal: amy_showEntry, amy_showTradeLines

# Write
with open("AMY_Ultimate_Professional_Suite.pine", "w", encoding="utf-8") as f:
    f.write(ultimate)

print("Build Ultimate Professional Suite done.")
