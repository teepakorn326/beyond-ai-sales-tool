"""Synthetic document generator.

Real student documents cannot be used for evaluation, so this builds fake ones
instead. The upside is not just privacy: because the generator chooses every
value, ground truth comes free with each document. That makes field-level
accuracy measurable without anyone hand-labelling a corpus.

Each record is emitted as HTML plus a JSON ground-truth file. Rendering to PNG
is a separate step (Playwright) so that the corpus can be regenerated and
diffed without a browser in the loop.

Three document types are rendered per record: a transcript, a passport
bio-data page and an IELTS Test Report Form. All three are rendered from the
same ground-truth record, so cross-document consistency (or the deliberate
lack of it) is known in advance.
"""

import argparse
import html
import json
import random
from datetime import date, timedelta
from math import floor
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

TEST_CENTRES = [
    "British Council Bangkok", "IDP Bangkok", "IDP Chiang Mai", "IDP Khon Kaen",
]

# IELTS component bands are reported in half-band steps.
BANDS = [5.0, 5.5, 6.0, 6.5, 7.0, 7.5]

# Mirrors rules.DefaultConfig().EnglishValidYears. The generator needs the same
# number so that `english_test_lapsed` means exactly "R5 blocks this case".
ENGLISH_VALID_YEARS = 2

# Identifier placeholders. The schema records only `*_present: bool`, so the
# documents carry a visibly non-numeric placeholder where the number would be.
# Never replace these with anything in the real format, even a made-up one.
PASSPORT_NUMBER_PLACEHOLDER = "XXXXXXXXX"
REPORT_NUMBER_PLACEHOLDER = "XXXXXXXXXXXXXXXXXX"


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


def add_years(d: date, n: int) -> date:
    """Same normalisation as Go's time.AddDate: 29 Feb + 1 year becomes 1 Mar."""
    try:
        return d.replace(year=d.year + n)
    except ValueError:
        return d.replace(year=d.year + n, month=3, day=1)


def ielts_overall(bands: list[float]) -> float:
    """IELTS rounds the mean of the four components to the nearest half band,
    with .25 rounding up to .5 and .75 rounding up to the next whole band."""
    mean = sum(bands) / len(bands)
    return floor(mean * 2 + 0.5) / 2


def make_record(i: int, rng: random.Random) -> dict:
    given, surname = rng.choice(GIVEN), rng.choice(SURNAME)
    dob = rand_date(rng, date(2000, 1, 1), date(2007, 12, 31))
    grad = rand_date(rng, date(2024, 1, 1), date(2026, 6, 30))

    # The day the agency plans to lodge. R4 and R5 are judged against this
    # date, so the passport and English-test imperfections are defined
    # relative to it rather than to whenever the generator happens to run.
    submission_target = rand_date(rng, date(2026, 9, 1), date(2027, 6, 30))
    course_end = submission_target + timedelta(days=rng.randint(365, 365 * 3))

    # Deliberate imperfections, each mirroring a failure seen in real intake.
    name_differs = rng.random() < 0.25            # transcript romanised differently
    buddhist_era = rng.random() < 0.40            # Thai transcript prints BE years
    no_grad_day = rng.random() < 0.20             # month and year only
    faint_gpa = rng.random() < 0.15               # low-contrast number
    passport_expiring_soon = rng.random() < 0.15  # expires within two years of lodging
    english_test_lapsed = rng.random() < 0.30     # older than two years at lodging

    transcript_name = f"{vary(given, rng)} {surname}" if name_differs else f"{given} {surname}"

    if passport_expiring_soon:
        expiry = submission_target + timedelta(days=rng.randint(30, 730))
    else:
        expiry = rand_date(rng, add_years(submission_target, 3), add_years(submission_target, 9))

    if english_test_lapsed:
        # Expired on or before the target date: R5 blocks when expiry is not
        # strictly after the submission target.
        expired_by = add_years(submission_target, -ENGLISH_VALID_YEARS)
        test = expired_by - timedelta(days=rng.randint(1, 400))
    else:
        # Still valid on the target date, sometimes only just (R5 warns inside
        # its warn window, which is exactly the case a reviewer needs to see).
        test = submission_target - timedelta(days=rng.randint(0, 700))

    bands = [rng.choice(BANDS) for _ in range(4)]
    listening, reading, writing, speaking = bands

    return {
        "id": f"synth-{i:04d}",
        "flags": {
            "name_differs": name_differs,
            "buddhist_era": buddhist_era,
            "no_grad_day": no_grad_day,
            "faint_gpa": faint_gpa,
            "passport_expiring_soon": passport_expiring_soon,
            "english_test_lapsed": english_test_lapsed,
        },
        "case": {
            "submission_target": submission_target.isoformat(),
            "course_end_date": course_end.isoformat(),
        },
        "passport": {
            "given_name_latin": given.upper(),
            "surname_latin": surname.upper(),
            "date_of_birth": dob.isoformat(),
            "nationality": "THA",
            "passport_expiry": expiry.isoformat(),
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
            "test_centre": rng.choice(TEST_CENTRES),
            "overall": ielts_overall(bands),
            "listening": listening,
            "reading": reading,
            "writing": writing,
            "speaking": speaking,
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


PASSPORT_HTML = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{{font-family:Arial,Helvetica,sans-serif;width:760px;padding:40px;color:#1a1a2e;
  background:#f4f1ea}}
.page{{border:1px solid #9a9a9a;border-radius:6px;padding:26px 30px;background:#fbfaf6}}
h1{{font-size:15px;letter-spacing:2px;margin:0 0 4px;color:#3a2a6a}}
.th{{font-size:13px;color:#3a2a6a;margin-bottom:18px}}
.grid{{display:grid;grid-template-columns:150px 1fr 1fr;gap:6px 14px;font-size:13px}}
.photo{{grid-row:span 7;width:120px;height:150px;border:1px solid #888;background:#d9d4c7}}
.k{{font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.5px}}
.v{{font-size:14px;font-weight:bold;margin-bottom:6px}}
.mrz{{margin-top:26px;font-family:'OCR B','OCRB',Courier,monospace;font-size:19px;
  letter-spacing:2px;white-space:pre;line-height:1.5}}
.skew{{transform:rotate({skew}deg)}}
</style></head><body class="skew"><div class="page">
<h1>KINGDOM OF THAILAND &middot; PASSPORT</h1>
<div class="th">ราชอาณาจักรไทย &middot; หนังสือเดินทาง</div>
<div class="grid">
  <div class="photo"></div>
  <div><div class="k">Type</div><div class="v">P</div></div>
  <div><div class="k">Country Code</div><div class="v">{country}</div></div>
  <div><div class="k">Passport No.</div><div class="v">{number}</div></div>
  <div></div>
  <div><div class="k">Surname</div><div class="v">{surname}</div></div>
  <div></div>
  <div><div class="k">Given Name</div><div class="v">{given}</div></div>
  <div></div>
  <div><div class="k">Nationality</div><div class="v">{nationality}</div></div>
  <div></div>
  <div><div class="k">Date of Birth</div><div class="v">{dob}</div></div>
  <div></div>
  <div><div class="k">Date of Expiry</div><div class="v">{expiry}</div></div>
  <div></div>
</div>
<div class="mrz">{mrz1}
{mrz2}</div>
</div></body></html>"""


def mrz_check(s: str) -> str:
    """ICAO 9303 check digit: weights 7-3-1, digits as themselves, A-Z as 10-35, < as 0."""
    total = 0
    for i, ch in enumerate(s):
        if ch.isdigit():
            v = int(ch)
        elif ch.isalpha():
            v = ord(ch) - ord("A") + 10
        else:
            v = 0
        total += v * (7, 3, 1)[i % 3]
    return str(total % 10)


def mrz_lines(p: dict) -> tuple[str, str]:
    """Two 44-character lines in TD3 layout.

    The document-number field and the personal-number field are fillers. The
    former is deliberate (no passport numbers in the corpus, see the schema);
    the latter is where a Thai passport prints the national ID, which is PII
    and never generated here.
    """
    dob = date.fromisoformat(p["date_of_birth"]).strftime("%y%m%d")
    exp = date.fromisoformat(p["passport_expiry"]).strftime("%y%m%d")

    line1 = f"P<{p['issuing_country']}{p['surname_latin']}<<{p['given_name_latin']}"
    line1 = line1.replace(" ", "<").ljust(44, "<")[:44]

    number = "<" * 9
    personal = "<" * 14
    body = (
        number + mrz_check(number)
        + p["nationality"]
        + dob + mrz_check(dob)
        + "<"  # sex is not in the ground truth, so it is not printed
        + exp + mrz_check(exp)
        + personal + mrz_check(personal)
    )
    composite = mrz_check(number + mrz_check(number) + dob + mrz_check(dob)
                          + exp + mrz_check(exp) + personal + mrz_check(personal))
    line2 = body + composite
    assert len(line1) == 44 and len(line2) == 44
    return line1, line2


def render_passport(rec: dict, rng: random.Random) -> str:
    p = rec["passport"]
    dob = date.fromisoformat(p["date_of_birth"])
    expiry = date.fromisoformat(p["passport_expiry"])
    mrz1, mrz2 = mrz_lines(p)
    return PASSPORT_HTML.format(
        country=p["issuing_country"],
        number=PASSPORT_NUMBER_PLACEHOLDER,
        surname=p["surname_latin"],
        given=p["given_name_latin"],
        nationality=f"THAI ({p['nationality']})",
        dob=f"{dob:%d %b %Y}".upper(),
        expiry=f"{expiry:%d %b %Y}".upper(),
        # The MRZ filler character is "<", which a browser reads as a tag.
        mrz1=html.escape(mrz1),
        mrz2=html.escape(mrz2),
        skew=round(rng.uniform(-1.2, 1.2), 2),
    )


IELTS_HTML = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{{font-family:Arial,Helvetica,sans-serif;width:760px;padding:44px;color:#111}}
h1{{font-size:20px;margin:0;color:#c8102e}}
.sub{{font-size:12px;color:#444;margin-bottom:18px}}
.box{{border:1px solid #999;padding:10px 14px;margin-bottom:12px}}
.r{{display:flex;gap:14px;margin:4px 0;font-size:13px}}
.k{{width:170px;color:#333}}
.scores{{display:flex;gap:10px;margin-top:6px}}
.s{{flex:1;border:1px solid #999;text-align:center;padding:8px 0}}
.s .l{{font-size:10px;color:#444;text-transform:uppercase}}
.s .n{{font-size:22px;font-weight:bold}}
.overall .n{{color:#c8102e}}
.foot{{font-size:10px;color:#555;margin-top:18px}}
.skew{{transform:rotate({skew}deg)}}
</style></head><body class="skew">
<h1>IELTS</h1>
<div class="sub">Test Report Form &middot; Academic</div>
<div class="box">
<div class="r"><div class="k">Centre Name</div><div>{centre}</div></div>
<div class="r"><div class="k">Test Date</div><div>{test_date}</div></div>
<div class="r"><div class="k">Test Report Form Number</div><div>{number}</div></div>
</div>
<div class="box">
<div class="r"><div class="k">Candidate Name</div><div>{name}</div></div>
<div class="r"><div class="k">Date of Birth</div><div>{dob}</div></div>
</div>
<div class="scores">
  <div class="s"><div class="l">Listening</div><div class="n">{listening}</div></div>
  <div class="s"><div class="l">Reading</div><div class="n">{reading}</div></div>
  <div class="s"><div class="l">Writing</div><div class="n">{writing}</div></div>
  <div class="s"><div class="l">Speaking</div><div class="n">{speaking}</div></div>
  <div class="s overall"><div class="l">Overall Band Score</div>
    <div class="n">{overall}</div></div>
</div>
<div class="foot">The validity of this Test Report Form can be verified online by
  recognising organisations.</div>
</body></html>"""


def render_english_test(rec: dict, rng: random.Random) -> str:
    e = rec["english_test"]
    dob = date.fromisoformat(e["date_of_birth"])
    test = date.fromisoformat(e["test_date"])
    return IELTS_HTML.format(
        centre=e["test_centre"],
        test_date=f"{test:%d/%b/%Y}".upper(),
        number=REPORT_NUMBER_PLACEHOLDER,
        name=e["name_latin_as_printed"],
        dob=f"{dob:%d/%m/%Y}",
        listening=e["listening"],
        reading=e["reading"],
        writing=e["writing"],
        speaking=e["speaking"],
        overall=e["overall"],
        skew=round(rng.uniform(-1.2, 1.2), 2),
    )


OTHER_HTML = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{{font-family:Arial,Helvetica,sans-serif;width:560px;padding:40px;color:#222}}
h1{{font-size:16px;margin:0 0 2px}}
.sub{{font-size:12px;color:#666;margin-bottom:16px}}
table{{width:100%;border-collapse:collapse;font-size:13px}}
td{{padding:6px 4px;border-bottom:1px solid #ddd}}
td:last-child{{text-align:right}}
.total td{{font-weight:bold;border-top:2px solid #222}}
.skew{{transform:rotate({skew}deg)}}
</style></head><body class="skew">
<h1>{institution}</h1>
<div class="sub">ใบเสร็จรับเงินค่าธรรมเนียม / FEE RECEIPT &middot; {date}</div>
<table>
<tr><td>Application fee</td><td>{fee1}</td></tr>
<tr><td>Document processing</td><td>{fee2}</td></tr>
<tr class="total"><td>Total (THB)</td><td>{total}</td></tr>
</table>
<div class="sub" style="margin-top:20px">Received with thanks.
  This receipt is not an academic document.</div>
</body></html>"""


def render_other(rec: dict, rng: random.Random) -> str:
    """A page that is none of the four types. Exists so the classifier's
    "other" branch has ground truth, and so the eval can prove a fee receipt
    does not get extracted as a transcript."""
    fee1, fee2 = rng.choice([500, 1000, 1500]), rng.choice([200, 300, 800])
    return OTHER_HTML.format(
        institution=rec["transcript"]["institution_name"],
        date=f"{date.fromisoformat(rec['transcript']['date_graduated']):%d %b %Y}",
        fee1=f"{fee1:,}",
        fee2=f"{fee2:,}",
        total=f"{fee1 + fee2:,}",
        skew=round(rng.uniform(-1.2, 1.2), 2),
    )


# File suffix matches the doc_type the extractor and evals/run.py expect.
RENDERERS = {
    "transcript": render_transcript,
    "passport": render_passport,
    "english_test": render_english_test,
    "other": render_other,
}

FLAGS = [
    "name_differs",
    "buddhist_era",
    "no_grad_day",
    "faint_gpa",
    "passport_expiring_soon",
    "english_test_lapsed",
]


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
        for doc_type, render in RENDERERS.items():
            (args.out / f"{rec['id']}.{doc_type}.html").write_text(
                render(rec, rng), encoding="utf-8"
            )
        manifest.append(rec["id"])

    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    counts = {f: 0 for f in FLAGS}
    for rid in manifest:
        truth = json.loads((args.out / f"{rid}.truth.json").read_text(encoding="utf-8"))
        for f in FLAGS:
            counts[f] += truth["flags"][f]

    print(f"wrote {len(manifest)} records to {args.out}")
    for f, n in counts.items():
        print(f"  {f:24} {n:3}/{len(manifest)}")


if __name__ == "__main__":
    main()
