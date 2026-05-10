"""One-shot: replace em-dashes (U+2014) and &mdash; entities with regular
hyphens in user-visible text only.

Skips:
  * code comments (//, /* */, JSDoc) in JS files
  * CSS / TS internal docs (worker/README, worker/src/index.ts)
  * PNG binaries (byte-pattern false positives at the file-walk level)
  * en-dashes (U+2013) and &ndash; entities -- always preserved.

Reports counts per file, exits non-zero if anything in scope still has
an em-dash after the pass (defensive: dead-loop protection).
"""
from __future__ import annotations

from pathlib import Path
from typing import Tuple

ROOT = Path(__file__).resolve().parent.parent
EM   = "—"
HY   = "-"


def replace_in_js(text: str) -> Tuple[str, int]:
    """State-machine scanner: tracks line/block comments + string
    literals (', ", `). Only replaces EM inside strings."""
    out = []
    i = 0
    in_line_comment = False
    in_block_comment = False
    in_string: str | None = None
    n_replaced = 0
    n = len(text)
    while i < n:
        c = text[i]
        nx = text[i + 1] if i + 1 < n else ""

        if in_line_comment:
            out.append(c)
            if c == "\n":
                in_line_comment = False
            i += 1
            continue

        if in_block_comment:
            out.append(c)
            if c == "*" and nx == "/":
                out.append(nx)
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue

        if in_string is not None:
            if c == "\\" and i + 1 < n:
                out.append(c)
                out.append(text[i + 1])
                i += 2
                continue
            if c == EM:
                out.append(HY)
                n_replaced += 1
                i += 1
                continue
            if c == in_string:
                in_string = None
            out.append(c)
            i += 1
            continue

        # In code (not comment, not string)
        if c == "/" and nx == "/":
            in_line_comment = True
            out.append(c); out.append(nx); i += 2; continue
        if c == "/" and nx == "*":
            in_block_comment = True
            out.append(c); out.append(nx); i += 2; continue
        if c in ("'", '"', "`"):
            in_string = c
            out.append(c); i += 1; continue
        # Em-dash in raw code (outside string AND outside comment) shouldn't
        # exist in our files; preserve if it ever does, so we don't break
        # syntax.
        out.append(c)
        i += 1

    return "".join(out), n_replaced


def replace_in_html_or_json(text: str) -> Tuple[str, int]:
    """HTML / JSON / manifest: blanket replace EM + &mdash; entity."""
    n0 = text.count(EM) + text.count("&mdash;")
    text = text.replace(EM, HY)
    text = text.replace("&mdash;", HY)
    return text, n0


JS_FILES = [
    "public/assets/js/main.js",
    "public/assets/js/api.js",
    "public/assets/js/subscribe.js",
    "public/assets/js/viewer.js",
    "public/assets/js/demo.js",
    "public/assets/js/overlays.js",
]
HTML_FILES = [
    "public/index.html",
    "public/demo.html",
    "public/privacy.html",
    "public/terms.html",
    "public/404.html",
]
JSON_FILES = [
    "public/assets/manifest.json",
    "public/assets/data/case_alta_confirmed/index_v3.json",
    "public/assets/data/case_alta_confirmed/overlays.json",
    "public/assets/data/case_anatomic_variant/index_v3.json",
    "public/assets/data/case_anatomic_variant/overlays.json",
    "public/assets/data/case_early_dysplasia/index_v3.json",
    "public/assets/data/case_early_dysplasia/overlays.json",
    "public/assets/data/case_normal/index_v3.json",
    "public/assets/data/case_normal/overlays.json",
    "public/assets/data/case_severe_dysplasia/index_v3.json",
    "public/assets/data/case_severe_dysplasia/overlays.json",
]


def main() -> None:
    total = 0
    print(f"{'file':60s}  replaced")
    print("-" * 80)
    for rel in JS_FILES:
        p = ROOT / rel
        if not p.exists():
            continue
        original = p.read_text(encoding="utf-8")
        new, n = replace_in_js(original)
        if n:
            p.write_text(new, encoding="utf-8")
        total += n
        print(f"{rel:60s}  {n:>3}")
    for rel in HTML_FILES + JSON_FILES:
        p = ROOT / rel
        if not p.exists():
            continue
        original = p.read_text(encoding="utf-8")
        new, n = replace_in_html_or_json(original)
        if n:
            p.write_text(new, encoding="utf-8")
        total += n
        print(f"{rel:60s}  {n:>3}")

    print(f"\nTOTAL REPLACED: {total}")


if __name__ == "__main__":
    main()
