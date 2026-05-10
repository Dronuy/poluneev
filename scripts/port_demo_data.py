"""Port demo case data from pfi-engine into poluneev/public/assets/.

  - Copies slice PNGs to public/assets/img/<case>/sag,ax/*.png
  - Reads index_v3.json + overlays.json + slice_metadata.json
  - Strips fields that violate the Phase 2 IP scrub list
  - Writes scrubbed JSONs into public/assets/data/<case>/
  - Final pass: greps the destination for forbidden tokens; non-zero -> exit 2.

Usage:
    python -u scripts/port_demo_data.py
"""
from __future__ import annotations
import json
import re
import shutil
import sys
from pathlib import Path

SRC = Path(r"C:/AI_projects/pfi-engine/data")
DST = Path(__file__).resolve().parent.parent / "public" / "assets"
CASES = [
    "case_normal",
    "case_alta_confirmed",
    "case_anatomic_variant",
    "case_severe_dysplasia",
    "case_early_dysplasia",
]

# Per-spec forbidden top-level keys at any depth in the JSONs.
FORBIDDEN_KEYS = {
    "iop_laterality",
    "canonicalization_flip_applied",
    "cart_edge_canonical_source",
    "image_render_size_px",       # internal; not used by viewer
    "phenotype_v2",                # version string
    "study_id",                    # exact field name (study_id_label is fine)
    "sag_series_desc",
}

# Forbidden substrings anywhere in any string value (post-Phase-2 IP-scrub).
FORBIDDEN_SUBSTRINGS = (
    "v6_final", "v7_predicted", "v7_focal", "v2_dedicated", "v2_canonical",
    "heatmap_", "unet_seg_", "_seed42", "ProductionPipeline",
    "PTI_v2", "pti_v2", "cd_v2", "model_unet", "ax_meta_cache",
)


def scrub(node):
    """Recursively remove FORBIDDEN_KEYS and replace any string value
    that contains a FORBIDDEN_SUBSTRING with empty string."""
    if isinstance(node, dict):
        return {
            k: scrub(v)
            for k, v in node.items()
            if k not in FORBIDDEN_KEYS
        }
    if isinstance(node, list):
        return [scrub(v) for v in node]
    if isinstance(node, str):
        for token in FORBIDDEN_SUBSTRINGS:
            if token.lower() in node.lower():
                return ""
        return node
    return node


def find_leaks(text: str) -> list[str]:
    """Greppable leak detector — used as final-pass guardrail."""
    leaks = []
    for k in FORBIDDEN_KEYS:
        if re.search(r'"' + re.escape(k) + r'"\s*:', text):
            leaks.append(k)
    for tok in FORBIDDEN_SUBSTRINGS:
        if tok.lower() in text.lower():
            leaks.append(tok)
    return leaks


def main():
    if not SRC.exists():
        sys.exit(f"FATAL: source not found at {SRC}")

    img_root  = DST / "img"
    data_root = DST / "data"
    img_root.mkdir(parents=True, exist_ok=True)
    data_root.mkdir(parents=True, exist_ok=True)

    total_pngs = 0
    total_data = 0

    for case in CASES:
        src = SRC / case
        if not src.exists():
            print(f"  [skip] {case}: source missing")
            continue

        # 1. Slice PNGs
        for plane in ("sag", "ax"):
            src_dir = src / "slices" / plane
            dst_dir = img_root / case / plane
            if not src_dir.exists():
                print(f"  [warn] {case}/{plane}: no slice dir")
                continue
            dst_dir.mkdir(parents=True, exist_ok=True)
            for f in sorted(src_dir.glob("*.png")):
                shutil.copy2(f, dst_dir / f.name)
                total_pngs += 1

        # 2. JSONs (scrub during port)
        out_data = data_root / case
        out_data.mkdir(parents=True, exist_ok=True)
        for fname in ("index_v3.json", "overlays.json", "slice_metadata.json"):
            src_f = src / fname
            if not src_f.exists():
                print(f"  [warn] {case}/{fname}: missing")
                continue
            payload = json.loads(src_f.read_text(encoding="utf-8"))
            scrubbed = scrub(payload)
            (out_data / fname).write_text(
                json.dumps(scrubbed, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            total_data += 1

        print(f"  [ok]   {case}: slices + JSONs ported")

    # 3. Final-pass leak grep across all scrubbed files
    all_text = ""
    for f in (data_root).rglob("*.json"):
        all_text += f.read_text(encoding="utf-8")
    leaks = find_leaks(all_text)
    if leaks:
        print(f"\n  IP SCRUB FAIL: {len(leaks)} hits: {sorted(set(leaks))}")
        sys.exit(2)

    print(f"\n  Done. {total_pngs} PNGs + {total_data} JSONs ported.")
    print("  IP scrub: 0 hits across public/assets/data/.")


if __name__ == "__main__":
    main()
