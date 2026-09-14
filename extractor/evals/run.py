"""Produce predictions.json by running the corpus through the extractor.

Kept separate from the tests so the test suite stays free and deterministic.
This is the only part of the pipeline that costs money, and it prints what it
cost, because an accuracy number without a cost number is only half an answer.
"""

import argparse
import asyncio
import base64
import json
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE / "datasets"


async def render_png(html_path: Path) -> bytes:
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 860, "height": 1200})
        await page.goto(html_path.resolve().as_uri())
        png = await page.screenshot(full_page=True)
        await browser.close()
        return png


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--doc-type", default="transcript")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    from app.client import extract

    ids = json.loads((DATA / "manifest.json").read_text())
    if args.limit:
        ids = ids[: args.limit]

    out: dict[str, dict] = {}
    spent = 0
    for n, rid in enumerate(ids, 1):
        html = DATA / f"{rid}.{args.doc_type}.html"
        if not html.exists():
            continue
        png = await render_png(html)
        result, usage = extract(args.doc_type, [("image/png", base64.b64encode(png).decode())])
        out[rid] = result.model_dump(mode="json")
        spent += usage.input_tokens + usage.output_tokens
        print(f"[{n}/{len(ids)}] {rid}")

    preds_path = HERE / "predictions.json"
    existing = json.loads(preds_path.read_text()) if preds_path.exists() else {}
    existing[args.doc_type] = out
    preds_path.write_text(json.dumps(existing, indent=2, ensure_ascii=False))
    print(f"\nwrote {len(out)} predictions to {preds_path}")
    print(f"tokens spent: {spent:,} — report this next to the accuracy figures")


if __name__ == "__main__":
    asyncio.run(main())
