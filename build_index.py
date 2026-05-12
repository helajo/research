#!/usr/bin/env python3
"""
build_index.py — Market Monitor Index Generator
Run this script whenever you add new reports. It scans stocks/, deep-dives/,
and any other category folders and rebuilds index.html automatically.

Usage:
    python3 build_index.py
"""

import os
import re
from datetime import datetime
from pathlib import Path

# ══════════════════════════════════════════════════════════════════
#  SETTINGS — edit these two lines only
# ══════════════════════════════════════════════════════════════════
GITHUB_USERNAME = "helajo"
SITE_TITLE_EN   = "Market Monitor"
SITE_TITLE_CN   = "投研档案库"
SITE_TAGLINE    = "H.E.L.A.J.O. — Holding Equities, Long-term Assets, Joyous Outcomes"
# ══════════════════════════════════════════════════════════════════

CATEGORIES = {
    "stocks": {
        "label_en": "Stock Reports",
        "label_cn": "个股分析",
        "emoji":    "📈",
    },
    "deep-dives": {
        "label_en": "Deep Dives",
        "label_cn": "专题深度",
        "emoji":    "🔍",
    },
    "market": {
        "label_en": "Market Reports",
        "label_cn": "市场报告",
        "emoji":    "📊",
    },
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def extract_meta(filepath: Path) -> dict:
    """Read the HTML file and extract title, date, and a short summary."""
    try:
        content = filepath.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        content = ""

    # Title: <title> tag → first <h1> → filename
    title = ""
    m = re.search(r"<title[^>]*>(.*?)</title>", content, re.IGNORECASE | re.DOTALL)
    if m:
        title = re.sub(r"\s+", " ", m.group(1)).strip()
    if not title:
        m = re.search(r"<h1[^>]*>(.*?)</h1>", content, re.IGNORECASE | re.DOTALL)
        if m:
            title = re.sub(r"<[^>]+>", "", m.group(1)).strip()
    if not title:
        title = filepath.stem.replace("_", " ").replace("-", " ")

    # Date: <meta name="date"> → date in filename → file modified time
    date = ""
    m = re.search(r'<meta[^>]+name=["\']date["\'][^>]+content=["\']([^"\']+)["\']',
                  content, re.IGNORECASE)
    if m:
        date = m.group(1).strip()
    if not date:
        m = re.search(r"(\d{4}-\d{2}-\d{2})", filepath.name)
        if m:
            date = m.group(1)
    if not date:
        mtime = os.path.getmtime(filepath)
        date = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d")

    # Summary: <meta name="description"> → first text block in body
    summary = ""
    m = re.search(
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']{20,})["\']',
        content, re.IGNORECASE)
    if m:
        summary = m.group(1).strip()
    if not summary:
        body = re.sub(r"<style[^>]*>.*?</style>", "", content,
                      flags=re.DOTALL | re.IGNORECASE)
        body = re.sub(r"<script[^>]*>.*?</script>", "", body,
                      flags=re.DOTALL | re.IGNORECASE)
        body = re.sub(r"<[^>]+>", " ", body)
        body = re.sub(r"\s+", " ", body).strip()
        if len(body) > 100:
            summary = body[100:360].strip()
            summary = re.sub(r"^\W+", "", summary)

    return {
        "title":    title[:120],
        "date":     date,
        "summary":  summary[:280] if summary else "—",
        "filename": filepath.name,
    }


def collect_reports(root: Path) -> list:
    reports = []
    for folder, meta in CATEGORIES.items():
        folder_path = root / folder
        if not folder_path.exists():
            continue
        for html_file in sorted(folder_path.glob("*.html"),
                                key=os.path.getmtime, reverse=True):
            info = extract_meta(html_file)
            info["folder"]   = folder
            info["meta"]     = meta
            info["url"]      = f"{folder}/{html_file.name}"
            reports.append(info)
    reports.sort(key=lambda r: r["date"] or "0000-00-00", reverse=True)
    return reports


def count_by_category(reports: list) -> dict:
    counts = {k: 0 for k in CATEGORIES}
    for r in reports:
        counts[r["folder"]] = counts.get(r["folder"], 0) + 1
    return counts


# ── HTML Generation ────────────────────────────────────────────────────────────

def render_card(r: dict) -> str:
    m = r["meta"]
    label = f'{m["emoji"]} {m["label_en"]} · {m["label_cn"]}'
    return f"""        <a class="card" href="{r['url']}" data-cat="{r['folder']}">
          <div class="card-header">
            <span class="cat-pill cat-{r['folder']}">{label}</span>
            <span class="card-date">{r['date']}</span>
          </div>
          <div class="card-title">{r['title']}</div>
          <div class="card-summary">{r['summary']}</div>
          <div class="card-file">📄 {r['filename']}</div>
        </a>"""


def build_html(reports: list, counts: dict) -> str:
    total = len(reports)
    now   = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Filter pills
    all_pill = f'<button class="pill pill-all active" data-filter="all">All · 全部 <span class="pill-count">{total}</span></button>'
    cat_pills = ""
    for k, v in CATEGORIES.items():
        n = counts.get(k, 0)
        label = f'{v["emoji"]} {v["label_en"]} · {v["label_cn"]}'
        cat_pills += f'\n    <button class="pill" data-filter="{k}">{label} <span class="pill-count">{n}</span></button>'

    cards = "\n".join(render_card(r) for r in reports)
    if not cards:
        cards = '        <div class="empty-state">No reports yet. Add HTML files to stocks/ or deep-dives/ and run the script again.</div>'

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{SITE_TITLE_EN} · {SITE_TITLE_CN}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    :root {{
      --bg:           #f7f6f1;
      --surface:      #ffffff;
      --surface-2:    #f0efe8;
      --border:       #e2e0d6;
      --text:         #18170f;
      --text-2:       #5a5849;
      --text-3:       #9b9888;
      --accent:       #185FA5;
      --accent-bg:    #e8f1fb;
      --stocks-bg:    #e8f1fb;
      --stocks-fg:    #0d4a8a;
      --dives-bg:     #ede8fb;
      --dives-fg:     #4a2d8a;
      --market-bg:    #e6f7f1;
      --market-fg:    #085041;
      --radius:       12px;
      --radius-sm:    7px;
      --shadow:       0 1px 2px rgba(0,0,0,.04), 0 3px 10px rgba(0,0,0,.06);
      --shadow-hover: 0 4px 6px rgba(0,0,0,.06), 0 10px 28px rgba(0,0,0,.1);
    }}

    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

    body {{
      font-family: 'DM Sans', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }}

    /* ── Header ── */
    .header {{
      background: var(--text);
      color: #fff;
      padding: 52px 32px 40px;
    }}
    .header-inner {{
      max-width: 1160px;
      margin: 0 auto;
    }}
    .header-eyebrow {{
      font-size: 10px;
      font-family: 'JetBrains Mono', monospace;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: rgba(255,255,255,.4);
      margin-bottom: 10px;
    }}
    .header-title {{
      font-family: 'DM Serif Display', serif;
      font-size: clamp(32px, 5vw, 52px);
      font-weight: 400;
      letter-spacing: -.02em;
      line-height: 1.1;
    }}
    .header-title span {{
      display: block;
      font-size: .48em;
      font-family: 'DM Sans', sans-serif;
      font-weight: 300;
      letter-spacing: .01em;
      color: rgba(255,255,255,.5);
      margin-top: 6px;
    }}
    .header-tagline {{
      margin-top: 14px;
      font-size: 12px;
      font-family: 'JetBrains Mono', monospace;
      color: rgba(255,255,255,.35);
      letter-spacing: .06em;
      border-top: 1px solid rgba(255,255,255,.1);
      padding-top: 12px;
    }}
    .header-tagline strong {{
      color: rgba(255,255,255,.6);
      letter-spacing: .12em;
    }}
    .header-stats {{
      display: flex;
      gap: 28px;
      margin-top: 28px;
      flex-wrap: wrap;
    }}
    .stat {{
      display: flex;
      flex-direction: column;
      gap: 2px;
    }}
    .stat-num {{
      font-family: 'DM Serif Display', serif;
      font-size: 26px;
      font-weight: 400;
      color: #fff;
      line-height: 1;
    }}
    .stat-label {{
      font-size: 10px;
      color: rgba(255,255,255,.4);
      font-family: 'JetBrains Mono', monospace;
      letter-spacing: .06em;
      text-transform: uppercase;
    }}
    .stat-divider {{
      width: 1px;
      background: rgba(255,255,255,.12);
      align-self: stretch;
    }}

    /* ── Filter bar ── */
    .filter-bar {{
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(247,246,241,.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 10px 32px;
    }}
    .filter-inner {{
      max-width: 1160px;
      margin: 0 auto;
      display: flex;
      gap: 7px;
      align-items: center;
      flex-wrap: wrap;
    }}
    .pill {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1.5px solid var(--border);
      background: transparent;
      border-radius: 20px;
      padding: 5px 13px;
      font-size: 12px;
      font-family: 'DM Sans', sans-serif;
      font-weight: 500;
      cursor: pointer;
      transition: all .14s ease;
      color: var(--text-2);
      white-space: nowrap;
    }}
    .pill:hover {{ border-color: var(--text); color: var(--text); background: var(--surface-2); }}
    .pill.active {{ background: var(--text); color: #fff; border-color: var(--text); }}
    .pill-count {{
      font-size: 10px;
      font-family: 'JetBrains Mono', monospace;
      opacity: .65;
    }}
    .pill.active .pill-count {{ opacity: .7; }}
    .filter-right {{
      margin-left: auto;
      font-size: 11px;
      color: var(--text-3);
      font-family: 'JetBrains Mono', monospace;
    }}

    /* ── Grid ── */
    .main {{
      max-width: 1160px;
      margin: 0 auto;
      padding: 28px 32px 80px;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
      gap: 14px;
    }}

    /* ── Card ── */
    .card {{
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 18px 20px 14px;
      text-decoration: none;
      color: inherit;
      display: flex;
      flex-direction: column;
      gap: 9px;
      box-shadow: var(--shadow);
      transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
      cursor: pointer;
    }}
    .card:hover {{
      transform: translateY(-3px);
      box-shadow: var(--shadow-hover);
      border-color: rgba(24,95,165,.3);
    }}
    .card.hidden {{ display: none; }}

    .card-header {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }}
    .cat-pill {{
      font-size: 10px;
      font-weight: 600;
      letter-spacing: .04em;
      border-radius: var(--radius-sm);
      padding: 3px 8px;
    }}
    .cat-stocks    {{ background: var(--stocks-bg); color: var(--stocks-fg); }}
    .cat-deep-dives {{ background: var(--dives-bg);  color: var(--dives-fg); }}
    .cat-market    {{ background: var(--market-bg); color: var(--market-fg); }}

    .card-date {{
      font-size: 11px;
      color: var(--text-3);
      font-family: 'JetBrains Mono', monospace;
      flex-shrink: 0;
    }}
    .card-title {{
      font-family: 'DM Serif Display', serif;
      font-size: 16.5px;
      font-weight: 400;
      line-height: 1.38;
      color: var(--text);
    }}
    .card-summary {{
      font-size: 12.5px;
      color: var(--text-2);
      line-height: 1.68;
      flex: 1;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }}
    .card-file {{
      font-size: 10px;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-3);
      border-top: 1px solid var(--border);
      padding-top: 9px;
      margin-top: 3px;
    }}

    .empty-state {{
      grid-column: 1 / -1;
      text-align: center;
      padding: 80px 0;
      color: var(--text-3);
      font-size: 14px;
    }}

    /* ── Footer ── */
    .footer {{
      text-align: center;
      padding: 20px 32px;
      font-size: 11px;
      color: var(--text-3);
      font-family: 'JetBrains Mono', monospace;
      border-top: 1px solid var(--border);
    }}

    /* ── Responsive ── */
    @media (max-width: 640px) {{
      .header {{ padding: 36px 20px 28px; }}
      .filter-bar {{ padding: 10px 20px; }}
      .main {{ padding: 20px 16px 60px; }}
      .grid {{ grid-template-columns: 1fr; }}
      .header-stats {{ gap: 16px; }}
    }}
  </style>
</head>
<body>

<header class="header">
  <div class="header-inner">
    <div class="header-eyebrow">Personal Research Archive · 个人投研档案库</div>
    <h1 class="header-title">
      {SITE_TITLE_EN}
      <span>{SITE_TITLE_CN}</span>
    </h1>
    <div class="header-tagline"><strong>H.E.L.A.J.O.</strong> — Holding Equities, Long-term Assets, Joyous Outcomes</div>
    <div class="header-stats">
      <div class="stat">
        <div class="stat-num">{total}</div>
        <div class="stat-label">Total Reports</div>
      </div>
      <div class="stat-divider"></div>
      {"".join(f'<div class="stat"><div class="stat-num">{counts.get(k,0)}</div><div class="stat-label">{v["label_en"]}</div></div>' for k,v in CATEGORIES.items())}
    </div>
  </div>
</header>

<nav class="filter-bar">
  <div class="filter-inner">
    {all_pill}{cat_pills}
    <span class="filter-right" id="visible-count">{total} reports</span>
  </div>
</nav>

<main class="main">
  <div class="grid" id="card-grid">
{cards}
  </div>
</main>

<footer class="footer">
  Last updated: {now} · Auto-generated by build_index.py
</footer>

<script>
  const pills = document.querySelectorAll('.pill');
  const cards = document.querySelectorAll('.card');
  const countEl = document.getElementById('visible-count');

  pills.forEach(pill => {{
    pill.addEventListener('click', () => {{
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const filter = pill.dataset.filter;
      let visible = 0;
      cards.forEach(card => {{
        const hide = filter !== 'all' && card.dataset.cat !== filter;
        card.classList.toggle('hidden', hide);
        if (!hide) visible++;
      }});
      countEl.textContent = visible + ' reports';
    }});
  }});
</script>
</body>
</html>"""


# ── Main ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    root    = Path(__file__).parent
    reports = collect_reports(root)
    counts  = count_by_category(reports)
    html    = build_html(reports, counts)
    out     = root / "index.html"
    out.write_text(html, encoding="utf-8")

    print(f"\n✅  index.html rebuilt successfully")
    print(f"    Total reports: {len(reports)}")
    for folder, count in counts.items():
        v = CATEGORIES[folder]
        print(f"    {v['emoji']}  {v['label_en']}: {count}")
    print(f"\n    Next: open GitHub Desktop and push your changes.\n")
