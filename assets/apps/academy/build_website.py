import os
import re
import shutil
import markdown
import glob
from pathlib import Path

vault_dir = "/storage/emulated/0/Download/obsidian/Amy_Trading_Academy_Vault"
web_dir = "/storage/emulated/0/Download/amy-trading-academy"

def slugify(text):
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-')

def parse_obsidian_syntax(md_text, slug_map=None):
    if slug_map is None:
        slug_map = {}
        
    # Handle Wiki Links [[Page Name]] FIRST so they are ready before callouts are parsed
    def wiki_repl(match):
        page_name = match.group(1)
        if "|" in page_name:
            link, text = page_name.split("|", 1)
        else:
            link, text = page_name, page_name
            
        # If it's an image link
        if link.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp')):
            # The '!' is outside the [[...]] so the markdown parser will see ![...](../images/...)
            return f'[{text}](../images/{link})'
            
        link_slug = slugify(link)
        if link_slug in slug_map:
            return f'[{text}]({slug_map[link_slug]})'
        else:
            return f'[{text}]({link_slug}.html)'
        
    md_text = re.sub(r'\[\[(.*?)\]\]', wiki_repl, md_text)

    # Handle Callouts AFTER Wiki Links
    callout_pattern = re.compile(r'^> \[!(\w+)\]\s*(.*)\n((?:>.*\n?)*)', re.MULTILINE)
    
    def callout_repl(match):
        ctype = match.group(1).lower()
        title = match.group(2).strip()
        content = match.group(3)
        
        # Clean up the '>' from the content
        content = re.sub(r'^>\s?', '', content, flags=re.MULTILINE)
        
        css_class = "note"
        if ctype in ['warning', 'caution']:
            css_class = "warning"
        elif ctype in ['tip', 'important']:
            css_class = "tip"
            
        html_content = markdown.markdown(content)
        return f'<div class="{css_class}"><strong>{title}</strong><br>{html_content}</div>\n'

    md_text = callout_pattern.sub(callout_repl, md_text)
    return md_text

def build_template(title, section_name, content):
    template = f"""<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>{title} — Amy FX Academy</title>
  <link rel="stylesheet" href="../assets/css/style.css">
  <link rel="stylesheet" href="../assets/css/glass.css">
  <script>const ROOT_PATH='../';</script>
  <script src="../assets/js/auth.js"></script>
  <script src="../assets/js/main.js" defer></script>
</head>
<body>
<script>requireLogin();</script>
<header class="topbar hide-until-auth">
  <nav class="nav">
    <a class="brand" href="../index.html">
      <span class="brand-mark">A</span>
      <span>Amy FX Academy</span>
    </a>
    <button class="hamburger" id="hamburger" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
    <div class="navlinks" id="navlinks">
      <a href="../index.html">Beranda</a>
      <a href="../daftar-materi.html">Daftar Materi</a>
      <a href="../tentang.html">Tentang</a>
      <a href="../glosarium/index.html">Glosarium</a>
    </div>
  </nav>
</header>
<main class="container hide-until-auth">
  <section class="article">
    <div class="breadcrumb">
      <a href="../index.html">Beranda</a> › 
      <a href="../daftar-materi.html">Daftar Materi</a> ›
      <a href="index.html">{section_name}</a>
    </div>
    
    <div class="glass-panel" style="margin-top: 20px;">
        {content}
    </div>
  </section>
</main>

<footer class="footer hide-until-auth">
  © 2026 Amy FX Academy. Belajar Trading dari Nol sampai Mandiri.
</footer>
</body>
</html>"""
    return template

def main():
    print("Starting build process...")
    
    # Pre-compute slug_map for cross-linking
    slug_map = {}
    for b_dir in os.listdir(vault_dir):
        if not b_dir.startswith("bagian-"):
            continue
        src_b_dir = os.path.join(vault_dir, b_dir)
        if not os.path.isdir(src_b_dir):
            continue
        for md_file in glob.glob(os.path.join(src_b_dir, "*.md")):
            slug = slugify(Path(md_file).stem)
            slug_map[slug] = f"../{b_dir}/{slug}.html"
            
    # Also map exact filenames in case they have numbers? Not needed, we use slug.
    
    # Make sure web_dir/images exists
    images_src = os.path.join(vault_dir, "images")
    images_dst = os.path.join(web_dir, "images")
    if os.path.exists(images_src):
        os.makedirs(images_dst, exist_ok=True)
        # copy images recursively
        for root, dirs, files in os.walk(images_src):
            for img in files:
                src_file = os.path.join(root, img)
                dst_file = os.path.join(images_dst, img)
                shutil.copy2(src_file, dst_file)
        print("Images copied recursively.")

    total_files = 0
    
    # Process all bagian-* directories
    for b_dir in os.listdir(vault_dir):
        if not b_dir.startswith("bagian-"):
            continue
            
        src_b_dir = os.path.join(vault_dir, b_dir)
        if not os.path.isdir(src_b_dir):
            continue
            
        dst_b_dir = os.path.join(web_dir, b_dir)
        os.makedirs(dst_b_dir, exist_ok=True)
        
        section_name = b_dir.replace("-", " ").title()
        
        md_files = sorted(glob.glob(os.path.join(src_b_dir, "*.md")))
        
        for md_file in md_files:
            file_path = os.path.join(src_b_dir, md_file)
            with open(file_path, "r", encoding="utf-8") as f:
                md_content = f.read()
                
            title_match = re.search(r'^#\s+(.*)', md_content, re.MULTILINE)
            title = title_match.group(1).replace("[[", "").replace("]]", "") if title_match else Path(md_file).stem
            
            md_content = re.sub(r'^#\s+.*$', '', md_content, flags=re.MULTILINE)
            md_content = parse_obsidian_syntax(md_content, slug_map)
            
            html_content = markdown.markdown(md_content, extensions=['tables', 'fenced_code'])
            
            # Robust image fix for any leftover <img src="...">
            def fix_img_src(m):
                src = m.group(1)
                if src.startswith('http') or src.startswith('../'):
                    return m.group(0)
                else:
                    return f'src="../images/{os.path.basename(src)}"'
            html_content = re.sub(r'src="([^"]*)"', fix_img_src, html_content)
            
            final_content = f"<h1>{title}</h1>\n{html_content}"
            full_html = build_template(title, section_name, final_content)
            
            # Save HTML file using slugify to match internal wiki links
            out_filename = slugify(Path(md_file).stem) + ".html"
            out_path = os.path.join(dst_b_dir, out_filename)
            
            with open(out_path, "w", encoding="utf-8") as f:
                f.write(full_html)
            total_files += 1
                
        print(f"Processed {b_dir} ({len(md_files)} files)")
    
    print(f"Build complete! Converted {total_files} files.")

if __name__ == "__main__":
    main()
