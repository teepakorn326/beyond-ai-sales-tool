"""Synthetic document generator.

Real student documents cannot be used for evaluation, so this builds fake ones
instead. The upside is not just privacy: because the generator chooses every
value, ground truth comes free with each document. That makes field-level
accuracy measurable without anyone hand-labelling a corpus.

Each record is emitted as HTML plus a JSON ground-truth file. Rendering to PNG
is a separate step (Playwright) so that the corpus can be regenerated and
diffed without a browser in the loop.
"""

import argparse
import json
import random
from datetime import date, timedelta
from pathlib import Path

GIVEN = ["Suwanna", "Thanawat", "Kanyarat", "Phanit", "Siree", "Boonmee", "Chaiya", "Nattapong"]
SURNAME = ["Jaroensuk", "Sombat", "Rattanakul", "Pongsakorn", "Wichaikul", "Srisawat"]

# Spelling variants a Thai name legitimately picks up across documents. The
# extractor must reproduce whatever is printed; reconciling them is R1's job.
VARIANTS = [("w", "v"), ("ph", "p"), ("th", "t"), ("kh", "k"), ("ee", "i"), ("oo", "u")]

SCHOOLS = [
    "Satri Witthaya School", "Bangkok Christian College",
    "Chulalongkorn University", "Kasetsart University", "Chiang Mai University",
]


def vary(name: str, rng: random.Random) -> str:
    """Produce a plausible alternative romanisation of the same Thai name."""
    lowered = name.lower()
    rng.shuffle(VARIANTS)
    for a, b in VARIANTS:
        if a in lowered:
            return (lowered.replace(a, b, 1)).title()
    return name


def rand_date(rng: random.Random, lo: date, hi: date) -> date:
    return lo + timedelta(days=rng.randint(0, (hi - lo).days))


def make_record(i: int, rng: random.Random) -> dict:
    given, surname = rng.choice(GIVEN), rng.choice(SURNAME)
    dob = rand_date(rng, date(2000, 1, 1), date(2007, 12, 31))
    grad = rand_date(rng, date(2024, 1, 1), date(2026, 6, 30))
    test = rand_date(rng, date(2024, 1, 1), date(2026, 8, 1))

    # Deliberate imperfections, each mirroring a failure seen in real intake.
    name_differs = rng.random() < 0.25   # transcript romanised differently
    buddhist_era = rng.random() < 0.40   # Thai transcript prints BE years
    no_grad_day = rng.random() < 0.20    # month and year only
    faint_gpa = rng.random() < 0.15      # low-contrast number

    transcript_name = f"{vary(given, rng)} {surname}" if name_differs else f"{given} {surname}"

    return {
        "id": f"synth-{i:04d}",
        "flags": {
            "name_differs": name_differs,
            "buddhist_era": buddhist_era,
            "no_grad_day": no_grad_day,
            "faint_gpa": faint_gpa,
        },
        "passport": {
            "given_name_latin": given.upper(),
            "surname_latin": surname.upper(),
            "date_of_birth": dob.isoformat(),
            "nationality": "THA",
            "passport_expiry": rand_date(rng, date(2027, 1, 1), date(2033, 12, 31)).isoformat(),
            "issuing_country": "THA",
            "passport_number_present": True,
        },
        "transcript": {
            "name_latin_as_printed": transcript_name.upper(),
            "date_of_birth": dob.isoformat(),
            "institution_name": rng.choice(SCHOOLS),
            "qualification": rng.choice(["Mathayom 6", "Bachelor of Science"]),
            "gpa": round(rng.uniform(2.0, 3.9), 2),
            "gpa_scale": 4.0,
            "date_graduated": grad.isoformat(),
            "date_source_calendar": "BE" if buddhist_era else "AD",
        },
        "english_test": {
            "test_type": "IELTS",
            "name_latin_as_printed": f"{given} {surname}".upper(),
            "date_of_birth": dob.isoformat(),
            "test_date": test.isoformat(),
            "overall": rng.choice([5.5, 6.0, 6.5, 7.0]),
            "writing": rng.choice([5.0, 5.5, 6.0, 6.5]),
            "report_number_present": True,
        },
    }


TRANSCRIPT_HTML = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{{font-family:'Times New Roman',serif;width:760px;padding:48px;color:#111}}
h1{{font-size:19px;text-align:center;letter-spacing:.5px}}
.r{{display:flex;gap:14px;margin:5px 0;font-size:14px}}
.k{{width:190px;color:#333}}
.gpa{{font-size:16px;font-weight:bold;{faint}}}
table{{width:100%;border-collapse:collapse;margin-top:18px;font-size:13px}}
td,th{{border-bottom:1px solid #ccc;padding:5px;text-align:left}}
.skew{{transform:rotate({skew}deg)}}
</style></head><body class="skew">
<h1>{institution}<br>ACADEMIC TRANSCRIPT</h1>
<div class="r"><div class="k">Name</div><div>{name}</div></div>
<div class="r"><div class="k">Date of Birth</div><div>{dob}</div></div>
<div class="r"><div class="k">Qualification</div><div>{qual}</div></div>
<div class="r"><div class="k">Date of Graduation</div><div>{grad}</div></div>
<table><tr><th>Course</th><th>Credits</th><th>Grade</th></tr>{rows}</table>
<div class="r" style="margin-top:22px">
  <div class="k">Cumulative GPA</div><div class="gpa">{gpa} / {scale}</div></div>
</body></html>"""

SUBJECTS = ["Mathematics", "Physics", "Chemistry", "English", "Thai", "Computer Science"]


def render_transcript(rec: dict, rng: random.Random) -> str:
    t = rec["transcript"]
    grad = date.fromisoformat(t["date_graduated"])
    year = grad.year + 543 if t["date_source_calendar"] == "BE" else grad.year
    grad_str = f"{grad:%B} {year}" if rec["flags"]["no_grad_day"] else f"{grad:%d %B} {year}"

    dob = date.fromisoformat(t["date_of_birth"])
    dob_year = dob.year + 543 if t["date_source_calendar"] == "BE" else dob.year

    rows = "".join(
        f"<tr><td>{s}</td><td>3</td><td>{rng.choice(['A','B+','B','C+','C'])}</td></tr>"
        for s in SUBJECTS
    )
    return TRANSCRIPT_HTML.format(
        institution=t["institution_name"],
        name=t["name_latin_as_printed"],
        dob=f"{dob:%d %B} {dob_year}",
        qual=t["qualification"],
        grad=grad_str,
        rows=rows,
        gpa=t["gpa"],
        scale=t["gpa_scale"],
        faint="color:#b8b8b8" if rec["flags"]["faint_gpa"] else "",
        skew=round(rng.uniform(-1.2, 1.2), 2),
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=100)
    ap.add_argument("--out", type=Path, default=Path("evals/datasets"))
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    args.out.mkdir(parents=True, exist_ok=True)

    manifest = []
    for i in range(args.count):
        rec = make_record(i, rng)
        (args.out / f"{rec['id']}.truth.json").write_text(
            json.dumps(rec, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        (args.out / f"{rec['id']}.transcript.html").write_text(
            render_transcript(rec, rng), encoding="utf-8"
        )
        manifest.append(rec["id"])

    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    flags = ["name_differs", "buddhist_era", "no_grad_day", "faint_gpa"]
    counts = {f: 0 for f in flags}
    for rid in manifest:
        truth = json.loads((args.out / f"{rid}.truth.json").read_text(encoding="utf-8"))
        for f in flags:
            counts[f] += truth["flags"][f]

    print(f"wrote {len(manifest)} records to {args.out}")
    for f, n in counts.items():
        print(f"  {f:16} {n:3}/{len(manifest)}")


if __name__ == "__main__":
    main()
