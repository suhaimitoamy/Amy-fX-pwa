import os
import re

base_dir = "/storage/emulated/0/Download/amy-trading-academy-repo"

# Map part numbers to their directory names and first/last files
parts_info = {
    16: ("bagian-16-advanced-entry-logic", "01-advanced-entry-logic.html", "03-checklist-validasi-sebelum-entry.html", "Advanced Entry Logic Masterclass", "Checklist Validasi Sebelum Entry"),
    17: ("bagian-17-fvg-masterclass", "01-fvg-kuat-vs-fvg-lemah.html", "03-kapan-fvg-lebih-kuat-dari-ob.html", "FVG Kuat vs FVG Lemah", "Kapan FVG Lebih Kuat dari OB"),
    18: ("bagian-18-order-block-masterclass", "01-ob-valid-vs-ob-palsu.html", "03-kapan-ob-lebih-kuat-dari-fvg.html", "OB Valid vs OB Palsu", "Kapan OB Lebih Kuat dari FVG"),
    19: ("bagian-19-liquidity-masterclass", "01-liquidity-sebagai-target-dan-trigger.html", "03-internal-dan-external-liquidity.html", "Liquidity Sebagai Target dan Trigger", "Internal dan External Liquidity"),
    20: ("bagian-20-idm-inducement-masterclass", "01-idm-sebelum-bos.html", "03-idm-yang-invalid.html", "IDM Sebelum BOS", "IDM yang Invalid"),
    21: ("bagian-21-ifvg-inversion-model", "01-fvg-gagal-menjadi-ifvg.html", "03-ifvg-plus-breaker.html", "FVG Gagal Menjadi IFVG", "IFVG + Breaker"),
    22: ("bagian-22-breaker-mitigation-rejection-advanced", "01-breaker-block-valid.html", "03-block-stacking.html", "Breaker Block Valid", "Block Stacking"),
    23: ("bagian-23-premium-discount-advanced", "01-dealing-range-yang-benar.html", "03-ote-vs-fvg-vs-ob.html", "Dealing Range yang Benar", "OTE vs FVG vs OB"),
    24: ("bagian-24-market-structure-advanced", "01-bos-valid-vs-bos-palsu.html", "03-internal-vs-external-structure.html", "BOS Valid vs BOS Palsu", "Internal vs External Structure"),
    25: ("bagian-25-session-entry-model", "01-asia-range-dan-liquidity.html", "03-new-york-distribution.html", "Asia Range dan Liquidity", "New York Distribution"),
    26: ("bagian-26-xauusd-advanced-playbook", "01-karakter-gold-per-session.html", "03-xauusd-liquidity-map.html", "Karakter Gold per Session", "XAUUSD Liquidity Map"),
    27: ("bagian-27-no-trade-advanced", "01-poi-bagus-tapi-tidak-entry.html", "03-entry-terlambat-dan-rr-rusak.html", "POI Bagus Tapi Tidak Entry", "Entry Terlambat dan RR Rusak"),
    28: ("bagian-28-trade-management-advanced", "01-partial-tp-dan-break-even.html", "03-scaling-in-dan-scaling-out.html", "Partial TP dan Break Even", "Scaling In dan Scaling Out"),
    29: ("bagian-29-backtest-advanced", "01-backtest-per-model-entry.html", "03-review-mingguan-dan-expectancy.html", "Backtest Per Model Entry", "Review Mingguan dan Expectancy"),
    30: ("bagian-30-a-plus-setup-library", "01-a-plus-fvg-setup.html", "03-a-plus-no-trade-example.html", "A+ FVG Setup", "A+ No Trade Example")
}

for part_num in range(16, 31):
    curr_dir, curr_first_file, curr_last_file, curr_first_title, curr_last_title = parts_info[part_num]
    
    # Fix the LAST file of current part to link to NEXT part
    if part_num < 30:
        next_dir, next_first_file, next_last_file, next_first_title, next_last_title = parts_info[part_num+1]
        
        last_file_path = os.path.join(base_dir, curr_dir, curr_last_file)
        if os.path.exists(last_file_path):
            with open(last_file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Replace <span></span> with a proper next button
            # But only the one inside <nav class="page-nav">
            next_link = f'<a class="btn primary" href="../{next_dir}/{next_first_file}">{next_first_title} →</a>'
            
            nav_pattern = r'(<nav class="page-nav">[\s\S]*?)<span></span>([\s\S]*?</nav>)'
            
            # Since the span is at the end (next button position)
            # wait, it might be <span></span> at the end or beginning
            def replace_next(m):
                nav_content = m.group(0)
                # the NEXT button is the last element before </nav>
                if nav_content.strip().endswith('<span></span>\n        </nav>') or nav_content.strip().endswith('<span></span></nav>'):
                    return nav_content.replace('<span></span>', next_link)
                else:
                    # just try to replace the last <span></span>
                    parts = nav_content.rsplit('<span></span>', 1)
                    if len(parts) == 2:
                        return parts[0] + next_link + parts[1]
                return nav_content

            new_content = re.sub(r'<nav class="page-nav">[\s\S]*?</nav>', replace_next, content)
            
            with open(last_file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
                
    # Fix the FIRST file of current part to link to PREV part
    if part_num > 16:
        prev_dir, prev_first_file, prev_last_file, prev_first_title, prev_last_title = parts_info[part_num-1]
        
        first_file_path = os.path.join(base_dir, curr_dir, curr_first_file)
        if os.path.exists(first_file_path):
            with open(first_file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            prev_link = f'<a class="btn" href="../{prev_dir}/{prev_last_file}">← {prev_last_title}</a>'
            
            def replace_prev(m):
                nav_content = m.group(0)
                # the PREV button is the first element after <nav class="page-nav">
                parts = nav_content.split('<span></span>', 1)
                if len(parts) == 2:
                    return parts[0] + prev_link + parts[1]
                return nav_content

            new_content = re.sub(r'<nav class="page-nav">[\s\S]*?</nav>', replace_prev, content)
            
            with open(first_file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)

print("Navigation fixed.")
