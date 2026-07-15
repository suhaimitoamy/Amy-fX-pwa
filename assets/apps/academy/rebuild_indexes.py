import os
import glob
import re

base_dir = "/storage/emulated/0/Download/amy-trading-academy"
bagian_dirs = glob.glob(os.path.join(base_dir, "bagian-*"))

for d in bagian_dirs:
    if not os.path.isdir(d): continue
    
    # 1. Delete old numbered files
    old_files = glob.glob(os.path.join(d, "[0-9][0-9]-*.html"))
    for old_f in old_files:
        os.remove(old_f)
        
    # 2. Gather new files
    new_files = [f for f in glob.glob(os.path.join(d, "*.html")) if os.path.basename(f) != "index.html"]
    new_files.sort()
    
    index_path = os.path.join(d, "index.html")
    if not os.path.exists(index_path): continue
    
    with open(index_path, "r", encoding="utf-8") as f:
        html = f.read()
        
    # 3. Replace the chapter-list contents
    match = re.search(r'(<div class="chapter-list">)(.*?)(</div><div class="quiz-container")', html, re.DOTALL)
    if not match:
        match = re.search(r'(<div class="chapter-list">)(.*?)(</div>)', html, re.DOTALL)
        
    if not match: continue
    
    prefix = html[:match.start(2)]
    suffix = html[match.end(2):]
    
    folder_title_match = re.search(r'<div class="eyebrow">(.*?)</div>', html)
    folder_title = folder_title_match.group(1) if folder_title_match else os.path.basename(d)
    
    new_list_html = ""
    for nf in new_files:
        filename = os.path.basename(nf)
        with open(nf, "r", encoding="utf-8") as nf_f:
            nf_html = nf_f.read()
            h1_match = re.search(r'<h1>(.*?)</h1>', nf_html)
            title = h1_match.group(1) if h1_match else filename.replace("-", " ").replace(".html", "").title()
            
            new_list_html += f'<a class="chapter-row" href="{filename}"><span><strong>{title}</strong><br><small>{folder_title}</small></span><span>→</span></a>'
            
    final_html = prefix + new_list_html + suffix
    with open(index_path, "w", encoding="utf-8") as f:
        f.write(final_html)

print("Indexes rebuilt successfully!")
