import os
import glob
import re

base_dir = "/storage/emulated/0/Download/amy-trading-academy-repo"
js_file = os.path.join(base_dir, "assets/js/advanced-content.js")

# Extract the AMY_ADVANCED_DATA from the JS file
import json

data_str = ""
with open(js_file, "r", encoding="utf-8") as f:
    content = f.read()
    match = re.search(r'window\.AMY_ADVANCED_DATA=(.*?);', content, re.DOTALL)
    if match:
        data_str = match.group(1)

if not data_str:
    print("Could not find AMY_ADVANCED_DATA")
    exit(1)

data = json.loads(data_str)

html_template = """<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>{title} — Amy Trading Academy</title>
  <link rel="stylesheet" href="../assets/css/style.css">
  <script>const ROOT_PATH='../';</script>
  <script src="../assets/js/auth.js"></script>
  <script src="../assets/js/main.js" defer></script>
</head>
<body>
  <script>requireLogin();</script>
  <header class="topbar hide-until-auth">
    <nav class="nav">
      <a class="brand" href="../index.html"><span class="brand-mark">A</span><span>Amy Trading Academy</span></a>
      <button class="hamburger" id="hamburger" aria-label="Menu"><span></span><span></span><span></span></button>
      <div class="navlinks" id="navlinks">
        <a href="../index.html">Beranda</a>
        <a href="../daftar-materi.html">Daftar Materi</a>
        <a href="../tentang.html">Tentang</a>
        <a href="../glosarium/index.html">Glosarium</a>
        <button class="btn ghost" onclick="logout()">Keluar</button>
      </div>
    </nav>
  </header>
  <main class="container hide-until-auth">
    <div class="article-layout">
      <article class="article">
        <div class="breadcrumb"><a href="../index.html">Beranda</a> › <a href="index.html">Bagian {part_num} — {part_title}</a></div>
        <div class="eyebrow">Bagian {part_num} — {part_title}</div>
        <h1>{title}</h1>
        
        {content}
        
        <div class="source-note">Materi ini disusun berdasarkan standar eksekusi lanjutan Smart Money Concepts (SMC) & Inner Circle Trader (ICT).</div>
        <nav class="page-nav">
          {prev_btn}
          <a class="btn gold" href="../daftar-materi.html">Daftar Materi</a>
          {next_btn}
        </nav>
      </article>
      <aside class="toc-card">
        <h3>Bagian {part_num} — {part_title}</h3>
        <ul>
          {toc}
        </ul>
      </aside>
    </div>
  </main>
  <footer class="footer hide-until-auth">© 2026 Amy Trading Academy. Belajar Trading dari Nol sampai Mandiri.</footer>
</body>
</html>"""

def generate_content(title, part_title):
    t = title.lower()
    paragraphs = [
        f"<p>Selamat datang di materi <strong>{title}</strong>. Pembahasan ini adalah bagian dari eksekusi tingkat lanjut dalam <strong>{part_title}</strong>. Kita akan mengupas tuntas mekanika market di balik pergerakan harga yang sering kali menjebak *retail trader*.</p>"
    ]
    
    if "fvg" in t or "imbalance" in t:
        paragraphs.extend([
            "<h2>Konsep Inti Fair Value Gap (FVG)</h2>",
            "<p>Fair Value Gap terjadi ketika ada pergerakan harga yang sangat cepat sehingga menyebabkan *imbalance* atau ketidakseimbangan antara *buyers* dan *sellers*. Area ini bagaikan magnet bagi harga di masa depan.</p>",
            "<p>Namun, tidak semua FVG layak untuk dijadikan *Point of Interest* (POI) untuk entry. FVG yang valid harus memiliki kriteria tertentu, seperti terbentuk setelah adanya penyapuan likuiditas (Liquidity Sweep) dan memecah struktur pasar (Market Structure Shift).</p>",
            "<div class='warning'><strong>Penting:</strong> Jangan asal pasang pending order di setiap FVG yang terlihat. Tunggu konfirmasi reaksi harga di Timeframe yang lebih kecil (LTF).</div>"
        ])
    elif "ob" in t or "order block" in t or "block" in t:
        paragraphs.extend([
            "<h2>Mekanika Order Block (OB)</h2>",
            "<p>Order Block adalah jejak kaki dari Smart Money atau institusi besar. Ini adalah *candle* terakhir sebelum pergerakan impulsif yang memecah struktur (BOS/MSS).</p>",
            "<p>Sebuah OB yang kuat (A+ Probability) biasanya belum termitigasi (*unmitigated*), memiliki imbalance (FVG) yang menyertainya, dan berada di area Premium (untuk Sell) atau Discount (untuk Buy).</p>",
            "<p>Jika sebuah OB sudah tersentuh bolak-balik oleh harga, maka OB tersebut kemungkinan besar sudah kehilangan order yang signifikan dan rawan menjadi *inducement*.</p>"
        ])
    elif "liquidity" in t or "idm" in t or "sweep" in t:
        paragraphs.extend([
            "<h2>Likuiditas adalah Bahan Bakar Market</h2>",
            "<p>Pasar bergerak dari satu titik likuiditas ke titik likuiditas lainnya. Mengapa? Karena Smart Money membutuhkan *liquidity* (pesanan dari trader lain) untuk mengeksekusi pesanan raksasa mereka tanpa menggeser harga terlalu parah.</p>",
            "<p>Jika Anda tidak bisa melihat di mana likuiditas berada di grafik, maka besar kemungkinan **Anda-lah likuiditasnya**.</p>",
            "<div class='note'><strong>Tips:</strong> Cari *Equal Highs* (EQH), *Equal Lows* (EQL), atau *Previous Day High/Low*. Itu adalah kolam likuiditas favorit institusi.</div>"
        ])
    elif "session" in t or "london" in t or "asia" in t or "new york" in t:
        paragraphs.extend([
            "<h2>Pentingnya Waktu (Killzones)</h2>",
            "<p>Konsep algoritma antarbank (IPDA) bekerja berdasarkan *Time and Price*. Harga (Price) saja tidak cukup jika waktunya (Time) salah.</p>",
            "<p>Asia Session biasanya membentuk *range* konsolidasi. London Session seringkali membuat *Fake Move* (manipulasi) untuk menyapu likuiditas Asia. New York Session sering melanjutkan tren dari London atau malah membuat pembalikan (*reversal*).</p>",
            "<p>Entry terbaik biasanya ada di jam-jam *Killzone* di mana volume transaksi antarbank sedang mencapai puncaknya.</p>"
        ])
    else:
        paragraphs.extend([
            "<h2>Penerapan dalam Eksekusi Harian</h2>",
            "<p>Dalam *Advanced Execution*, kita tidak sekadar mencari *setup*, tetapi menunggu konfirmasi yang selaras antara *Higher Timeframe* (HTF) sebagai arah utama (Bias) dan *Lower Timeframe* (LTF) sebagai pemicu (Trigger).</p>",
            "<p>Lakukan validasi berlapis: Apakah bias sudah benar? Apakah harga sudah masuk POI HTF? Apakah ada *Liquidity Grab*? Apakah *Risk to Reward Ratio* minimal 1:2?</p>",
            "<div class='note'><strong>Rule of Thumb:</strong> <em>Less is More</em>. Menunggu satu *setup* A+ jauh lebih baik daripada memaksakan lima *setup* berskala C.</div>"
        ])

    return "\n".join(paragraphs)

# Iterate through dirs
for part_num_str, part_data in data.items():
    part_title = part_data['title']
    lessons = part_data['lessons']
    
    # Find the corresponding directory
    # Format typically: bagian-16-advanced-entry-logic
    dir_pattern = os.path.join(base_dir, f"bagian-{part_num_str}-*")
    matching_dirs = glob.glob(dir_pattern)
    
    if not matching_dirs:
        print(f"Skipping part {part_num_str}, directory not found.")
        continue
        
    part_dir = matching_dirs[0]
    
    # generate files
    for idx, (filename, title) in enumerate(lessons):
        filepath = os.path.join(part_dir, filename)
        
        # Build TOC
        toc_html = ""
        for k, (l_file, l_title) in enumerate(lessons):
            active_class = "active" if k == idx else ""
            toc_html += f'<li><a class="{active_class}" href="{l_file}">{l_title}</a></li>\n          '
            
        # Prev / Next buttons
        prev_btn = "<span></span>"
        if idx > 0:
            p_file, p_title = lessons[idx-1]
            prev_btn = f'<a class="btn" href="{p_file}">← {p_title}</a>'
            
        next_btn = "<span></span>"
        if idx < len(lessons) - 1:
            n_file, n_title = lessons[idx+1]
            next_btn = f'<a class="btn primary" href="{n_file}">{n_title} →</a>'
            
        # Generate content
        content_html = generate_content(title, part_title)
        
        full_html = html_template.format(
            title=title,
            part_num=part_num_str.zfill(2),
            part_title=part_title,
            content=content_html,
            prev_btn=prev_btn,
            next_btn=next_btn,
            toc=toc_html
        )
        
        with open(filepath, "w", encoding="utf-8") as out_f:
            out_f.write(full_html)
            
    print(f"Generated {len(lessons)} lessons for Part {part_num_str}")

# Finally, neutralize advanced-content.js so it stops overriding
js_override = "// Konten sekarang bersifat statis, skrip auto-generate dinonaktifkan.\nconsole.log('Advanced content generator disabled.');\n"
with open(js_file, "w", encoding="utf-8") as f:
    f.write(js_override)

print("Done generating advanced content and disabling JS mockup.")
