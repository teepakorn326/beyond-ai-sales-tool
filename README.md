# Visa document checker

Pre-submission document checking for international student applications:
extract fields from student documents, have a human confirm them, then run
deterministic consistency rules across the whole case before anything is filed.

Built against a real workflow at a Thai education agency placing students in
Australia and New Zealand. All data in this repository is synthetic.

---

## The problem

An agency lodges a student visa application on a student's behalf. The single
most common reason an application is returned is not a weak candidate — it is a
document mismatch. A transcript romanises a Thai name as `SUVANNA` while the
passport says `SUWANNA`. A Thai transcript prints Buddhist-era years and a
`2569` graduation date silently becomes a date 543 years in the future. An
English test lapses two weeks before the intake closes.

Each of these costs the student a lodgement fee, weeks of processing time, and
in some cases a refusal on their immigration record. All of them are catchable
before submission, and all of them are currently caught by a person reading four
documents side by side.

## The design decision this project is really about

**The language model reads documents. It does not decide anything.**

Extraction is genuinely hard and genuinely probabilistic: handwriting, skew,
low-contrast print, non-standard layouts. That is the right job for a model, and
it is measured accordingly.

Comparing two dates is not. `2028-03-14 < 2028-06-30` has a correct answer every
single time, and a model that gets it right 97% of the time is worse than
useless here, because the 3% is invisible and lands on a student.

So the system is split in two:

| | extractor | rules |
|---|---|---|
| language | Python | Go |
| calls a model | yes | **never** |
| correctness | measured by eval, thresholds in CI | table-driven tests |
| changes | often, as prompts improve | rarely |

`rules/` contains no model client, no API key, no network call to a provider.
That is not a coincidence — it is the point of the boundary. Prompts and models
can be swapped without touching the logic that has to be right every time.

---

## Architecture

```
documents ──▶ extractor (Python)  ──▶  human confirms  ──▶  rules (Go)  ──▶  verdict
              model reads,              sales staff          pure date &
              returns typed JSON        checks values        string logic
```

The human step is not decoration. Extraction output is stored as
`extracted_json`; only after a person confirms it does it become
`confirmed_json`, and only `confirmed_json` reaches the rules engine.

The review UI presents high-confidence fields as a single batch confirmation and
forces low-confidence fields to be confirmed individually. A single
"confirm all" button would be rubber-stamped within a week and the review step
would become theatre.

---

## The rules

All five are blocking. All five are pure functions over dates and Latin-script
names, with no model in the path.

| id | rule | note |
|---|---|---|
| R1 | Latin name matches across all documents | passport is authoritative |
| R2 | date of birth matches across all documents | 543-year gap reported as an extraction bug, not a data conflict |
| R3 | graduation date on transcript vs certificate | 180-day window: in Thailand completion and conferral are routinely months apart |
| R4 | passport outlasts the course plus buffer | checked from assessment, not from visa stage |
| R5 | English test valid on the submission date | judged against the target date, not today |

Two of these encode domain knowledge that a generic rule set would get wrong:

**R2** — a Buddhist-era year that survives extraction still parses as a valid
date. It does not raise. It just quietly makes the applicant 543 years old. The
rule detects the exact 543-year gap and reports it as something to re-extract,
so nobody chases the student for a corrected document that was never wrong.

**R3** — a strict equality check here would flag almost every Thai case and
train staff to ignore the flag. The threshold is set from how the documents
actually behave, and the eval suite exists partly to prove what that threshold
costs.

**R1** — Thai-to-Latin transliteration leaves real choices open: `ph`/`p`,
`th`/`t`, `v`/`w`, `ee`/`i`. The comparison runs in three stages —
normalise, then fold romanisation variants, then escalate. Variants return
`warn`, never `pass`: the system says "these are probably the same person, a
human must confirm", which is a different claim from "these match".

```go
{"identical",        "SUWANNA JAROENSUK", "SUWANNA JAROENSUK", Pass},
{"order swapped",    "SUWANNA JAROENSUK", "JAROENSUK SUWANNA", Pass},
{"v to w",           "SUWANNA",           "SUVANNA",           Warn},
{"silent h",         "SUKHUMVIT",         "SUKUMWIT",          Warn},
{"different person", "SUWANNA JAROENSUK", "KANYARAT SOMBAT",   Block},
```

---

## Evaluation

Real student documents cannot be used, so the corpus is generated. That turns
out to be an advantage rather than a compromise: because the generator picks
every value, ground truth comes free with every document, and field-level
accuracy is measurable without hand-labelling anything.

`synth/generate.py` produces documents with the failure modes that appear in
real intake, at roughly the rates they appear:

```
name_differs             24/100   transcript romanised differently from passport
buddhist_era             34/100   BE years printed on a Thai transcript
no_grad_day               9/100   month and year only, no day
faint_gpa                21/100   low-contrast cumulative GPA
passport_expiring_soon   12/100   passport expires within two years of lodging (R4)
english_test_lapsed      35/100   IELTS older than two years on the target date (R5)
```

Each record renders three documents from one ground-truth file — transcript,
passport bio-data page with a machine-readable zone, and an IELTS Test Report
Form — so cross-document consistency is known before extraction runs. The
passport and IELTS imperfections are defined relative to the record's
`case.submission_target`, the same date R4 and R5 are judged against.
Identifier fields on the rendered pages are placeholders (`XXXXXXXXX`), never
numbers in the real format: the schema records only `*_present`.

Accuracy is reported per field, never as one number. An aggregate figure hides
the thing that matters — a run that reads every GPA correctly and every date of
birth incorrectly should not look identical to its opposite. Fields are weighted
by consequence, not by difficulty: a wrong `date_of_birth` gets an application
returned, a wrong `major` does not.

Thresholds live in `evals/thresholds.yaml` and are enforced in CI, so a prompt
change that regresses a field turns the pull request red.

```
$ make eval
transcript
  date_of_birth              ____   (__/100)
  date_graduated             ____   (__/100)
  gpa                        ____   (__/100)
  name_latin_as_printed      ____   (__/100)
```

> Numbers are filled in from a live run. Predictions are cached in CI keyed on
> the prompt file, so reviewing a pull request costs nothing and changing the
> prompt forces a fresh run.

---

## Privacy by construction

The agency handles academic and financial records belonging largely to minors,
under Thailand's PDPA and Australian privacy law. Those constraints shaped the
schema rather than being bolted on afterwards.

- The extraction prompt is instructed to **omit** national ID numbers,
  addresses, phone numbers and guardian names. `passport_number_present: bool`
  records that a number exists without storing it.
- The rules engine's `Case` struct carries dates and Latin names only — no Thai
  name, no identifier, no free text. It is a de-identified payload by design,
  which also means the whole rules path is safe to trace and log.
- Document content is treated as data, never instruction. Text inside a document
  that reads like a command is recorded in `suspicious_content` and ignored.

**What the system does not do**, deliberately: it does not estimate a visa
approval likelihood, does not draft or edit a Genuine Student statement, does
not advise on visa subclasses or migration pathways, and does not judge whether
a document is authentic. It answers one question — are the documents complete
and internally consistent — which has a right answer that can be checked in
three seconds.

---

## Running it

The short version, none of which needs an API key:

```bash
./run.sh test                 # every offline suite
./run.sh dev                  # rules engine + fake extractor + review UI on :3000
./run.sh render 0             # synthetic record 0 as PNGs in out/, ready to upload
./run.sh ask "case 0413 why is it blocked?"   # the agent, deterministic nodes only
./run.sh eval                 # agent eval report
```

The pieces:

```bash
cp .env.example .env          # add ANTHROPIC_API_KEY
make synth                    # generate 100 synthetic records
make rules-test               # Go test suite, no API key needed
make eval                     # extraction accuracy vs thresholds
make web-typecheck            # review UI against the hand-mirrored types
make agent-test               # agent unit tests + both eval suites, no key
make agent-eval               # agent eval report: trajectory (3 numbers), guardrail 30/30
make up                       # full stack on :3000
```

### The agent layer

`agent/` answers a sales user's question about a case, asked in Thai or English
("เคส 0413 ทำไมยังยื่นไม่ได้" / "why is case 0413 blocked?"), in English, with a
LangGraph state machine. Tools are
grouped by risk and the grouping is enforced by code: read-only tools run
freely, reversible internal writes run freely but are always audit-logged,
and anything that reaches the student refuses to run without an approval
bound to that exact call, which only a human `interrupt()` can produce. The
guardrail node runs first and is deterministic. Under Docker Compose the
agent runs as an HTTP service (`agent/agent/api.py`, `/ask` and `/resume`)
that the web tier calls; pending approvals are LangGraph interrupts held in
memory, so they belong to one agent process. Policy and programme search
read from Postgres with hybrid ranking: keyword match first, cosine
similarity from Cohere embeddings as a tie-break and as the fallback for
paraphrased questions. Details in [agent/README.md](agent/README.md).

### Batch intake

Students send photos, in any order, sometimes two per document. The upload
form takes all of them at once. The extractor's `/classify` endpoint says
what each page is (passport, transcript, degree certificate, English test,
or other) with a confidence and whether the page continues the previous
one. That is a model's job and gets its own eval: `python -m evals.run
--classify` scores every rendered page against the type encoded in its
filename, per true type, with floors in `evals/thresholds.yaml`. The
synthetic corpus includes a fee receipt per record so the "other" branch has
ground truth: a receipt must never be extracted as a transcript.

Code then groups pages into documents (`web/app/lib/sorting.ts`): a
continuation page joins the group before it, a passport is always one page,
and anything "other" or low-confidence is held for a person to assign a
type. Each confident group is extracted and lands in the review flow below
with the classifier's verdict shown on the review screen. If the reviewer
says the type is wrong, the same pages are extracted again under the new
type as a new document; the old record is marked superseded, never edited.

Every upload is normalised before it reaches a model (`extractor/app/images.py`):
PDFs are rendered page by page, photos are rotated per EXIF and downscaled to
1600px JPEG. HEIC needs the optional `pillow-heif` extra.

### The review screen

`web/` is the field-confirmation UI. Upload a document image under a case
id, the server sends it to the extractor, and the result is stored as
`extracted_json`. The reviewer then sees the image beside the fields:

- high-confidence fields are confirmed as one batch, as extracted;
- medium- and low-confidence fields are visually distinct and confirmed one
  at a time, with the value editable for genuine misreads;
- unreadable fields take a typed value, or record a "new photo" or "new
  document" request — different asks from the student's side, so kept apart;
- month-only dates show what the page printed next to the filled-in value,
  and Buddhist-era documents show the BE date as printed beside the converted
  Gregorian one, so the conversion is checked rather than trusted.

There is no "confirm all". Confirmations accumulate in `confirmations`, and
`confirmed_json` appears only once every required field is signed off; the
store refuses any write that touches `extracted_json`. The `/case` page
assembles the rules-engine payload from `confirmed_json` alone, so a document
that is uploaded but not fully reviewed contributes nothing and the rule that
needed it reports pending.

To exercise the UI without an API key, `node web/dev/fake-extractor.mjs`
stands in for the extractor with fixtures covering every review path (and a
deterministic `/embed`), and forwards `/check` to the Go service.

Records are rows in Postgres (`db/schema.sql`): documents, uploads, case
metadata, and a `case_profiles` table with pgvector embeddings. Page images
are objects in a private S3 bucket under opaque keys; the database stores the
key only and the browser only ever sees `/api/documents/[id]/image`. A
database trigger refuses any update to `extracted_json`, on top of the check
in `web/app/lib/store.ts`. `./run.sh dev` starts a local pgvector Postgres and
MinIO in Docker so none of this needs an AWS account offline.

### Mock verified students and the programme conversation

`make seed-demo` inserts five students (cases 0501–0505) whose four documents
are already confirmed and consistent, so each case is Ready; their page
images are rendered from small templates and stored in S3 like any upload.
Names come from the synthetic corpus, and qualification, field, GPA and
IELTS bands are set per persona so the assistant has something to reason
about. On a Ready case the assistant's suggestion chips lead with "Which
programmes fit this student?"; the answer draws only on the fictional
catalogue of 25 programmes, states each programme's English minimum against
the student's band and its GPA floor, and says plainly where the student
falls short. Visa, work-rights and residency questions still escalate.

### Similar cases and duplicate students

When a document becomes fully confirmed, the web tier rebuilds a PII-free
"case profile" for the case (`web/app/lib/profile.ts`): destination, intake,
programme, institution, qualification, field of study, and the English test
type with a half-band score bucket. That string is embedded through the
extractor and stored in `case_profiles`; the case overview lists the nearest
other cases by cosine similarity, showing the profile text as the
explanation. Names, dates of birth, scores and dates are never in it.

Duplicate students are found exactly, not semantically: a salted SHA-256 of
the confirmed passport surname, given name and date of birth. Two cases with
the same hash show an alert naming only the case ids.

## Deployed

Three services on Fly.io in `syd`, with only the web tier publicly addressable.
Full notes in [DEPLOY.md](DEPLOY.md); the parts worth knowing here:

**Sydney is a compliance choice, not a latency one.** The business has
Australian entities and handles academic records belonging largely to Thai
minors. In-region inference and storage is the answer that survives a question
from a parent or a privacy review, and it is a different answer from
"somewhere in us-east".

**Deploys are gated on the eval suite.** A prompt change that drops a field
below its accuracy floor fails CI and never ships.

**The public demo has a daily spend cap and accepts only synthetic documents.**
The cap is on tokens rather than requests, because one long PDF costs more than
a hundred passport pages. The synthetic-only restriction is not a technical
limit — a public URL that accepts passports is a liability, and a system built
for minors' documents should be demonstrated on documents nobody owns.

**`/readyz` fails when the rules engine is unreachable.** An extractor that
cannot reach the rules engine would keep extracting documents and silently
never check them, which is worse than being down: the case would look
processed.

## Stack

Python 3.12 · FastAPI · Pydantic · Anthropic SDK — extraction, evals, synthesis
Go 1.23 — rules engine, table-driven tests, no model dependency
TypeScript · Next.js 15 — review interface
PostgreSQL 16 + pgvector — records, policy index, case profiles (RDS in production)
Amazon S3 — document images (private bucket, opaque keys)
Amazon Bedrock — Claude for extraction and the agent, Cohere Embed Multilingual v3 for embeddings
Postgres · Docker Compose · GitHub Actions

Deliberately not used: no agent framework, no separate vector-database service (pgvector in the one Postgres), no fine-tuning.
The task is "structured input in, typed JSON out", which the SDK does directly.
An abstraction layer here would add debugging surface without adding capability.
# beyond-ai-sales-tool
