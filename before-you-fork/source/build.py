#!/usr/bin/env python3
"""Build the "Before You Fork" workshop page from its sources.

    python3 build.py

Reads content.json (every reader-facing string, English and Chinese) and template.html (layout, styles and the
script that renders the page), and writes two files:

- source/artifact.html  what is published as the Claude artifact (no <!doctype>/<html>/<head>/<body>: the
                        artifact host adds them)
- index.html            the same page as a complete HTML document, for this repository's GitHub Pages site

Standard library only. Check the result with `node check.js` (needs Playwright; screenshots go to _qa/).
"""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PAGE_DATE = "2026-11-14"
DESCRIPTION = ("Bilingual (English / 中文) cybersecurity workshop: seven questions to ask before you fork, install or "
               "connect any GitHub project, worked through on LobeHub, with a project scorer and checklist.")


def main() -> None:
    tpl = (HERE / "template.html").read_text(encoding="utf-8")
    data = json.loads((HERE / "content.json").read_text(encoding="utf-8"))
    js = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    js = js.replace("</", "<\\/").replace("<!--", "\\u003c!--")
    assert tpl.count("__CONTENT__") == 1, "template.html must hold one __CONTENT__ placeholder"
    artifact = tpl.replace("__CONTENT__", js)
    (HERE / "artifact.html").write_text(artifact, encoding="utf-8")

    split = artifact.index('<a class="skip"')  # everything before it belongs in <head>
    head, body = artifact[:split], artifact[split:]
    doc = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        f'<meta name="date" content="{PAGE_DATE}">\n'
        f'<meta name="description" content="{DESCRIPTION}">\n'
        + head + "</head>\n<body>\n" + body + "</body>\n</html>\n"
    )
    (HERE.parent / "index.html").write_text(doc, encoding="utf-8")
    print(f"artifact.html {len(artifact.encode('utf-8')):,} bytes; index.html {len(doc.encode('utf-8')):,} bytes")


if __name__ == "__main__":
    main()
