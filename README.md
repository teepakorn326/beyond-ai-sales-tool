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
name_differs      32/100   transcript romanised differently from passport
buddhist_era      41/100   BE years printed on a Thai transcript
no_grad_day       14/100   month and year only, no day
faint_gpa         10/100   low-contrast cumulative GPA
```

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

```bash
cp .env.example .env          # add ANTHROPIC_API_KEY
make synth                    # generate 100 synthetic records
make rules-test               # Go test suite, no API key needed
make eval                     # extraction accuracy vs thresholds
make up                       # full stack on :3000
```

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
Postgres · Docker Compose · GitHub Actions

Deliberately not used: no agent framework, no vector database, no fine-tuning.
The task is "structured input in, typed JSON out", which the SDK does directly.
An abstraction layer here would add debugging surface without adding capability.
