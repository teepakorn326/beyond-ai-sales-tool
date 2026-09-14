"""Seed the policy and programme indexes in Postgres from the JSON under
agent/data, embedding each row through the extractor's /embed route.

    python -m agent.seed            # upsert + embed (needs EXTRACTOR_URL)
    python -m agent.seed --no-embed # upsert rows only; keyword search still works

Rows whose content hash is unchanged are not re-embedded, so re-running is
free. Prints counts only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys

from .config import settings
from .pg import ExtractorEmbedder, PgConnections, _vec
from .services import DATA_DIR


def _policy_text(p: dict) -> str:
    return f"{p['title']}\n{p['topic']}\n{' '.join(p['keywords'])}\n{p['text']}"


def _program_text(p: dict) -> str:
    return f"{p['institution']} {p['level']} {p['field']} {p.get('city', '')} {p['country']} {p.get('description', '')}"


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-embed", action="store_true")
    args = ap.parse_args(argv)
    if not settings.database_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 1
    embedder = None if args.no_embed or not settings.extractor_url else ExtractorEmbedder(settings.extractor_url)
    conns = PgConnections(settings.database_url)

    policies = json.loads((DATA_DIR / "policies.json").read_text(encoding="utf-8"))
    programs = json.loads((DATA_DIR / "programs.json").read_text(encoding="utf-8"))
    counts = {"policies": 0, "programs": 0, "embedded": 0, "unchanged": 0}

    with conns.connection() as conn:
        # (content_hash, has_embedding) per id: unchanged text is re-embedded
        # only when a previous --no-embed run left the row without a vector.
        existing = {r[0]: (r[1], r[2]) for r in conn.execute("SELECT id, content_hash, embedding IS NOT NULL FROM policies").fetchall()}
        existing.update({r[0]: (r[1], r[2]) for r in conn.execute("SELECT id, content_hash, embedding IS NOT NULL FROM programs").fetchall()})

        def upsert(table: str, rows: list[dict], text_of, sql: str, values_of) -> None:
            to_embed = [(r, text_of(r)) for r in rows]
            need = [(r, t) for r, t in to_embed if embedder and existing.get(r["id"]) != (_hash(t), True)]
            vectors: dict[str, list[float]] = {}
            if need:
                for r, v in zip(need, embedder.embed([t for _, t in need], "document")):
                    vectors[r[0]["id"]] = v
                counts["embedded"] += len(need)
            counts["unchanged"] += len(to_embed) - len(need)
            for r, t in to_embed:
                conn.execute(sql, values_of(r, t, vectors.get(r["id"])))
                counts[table] += 1

        upsert(
            "policies",
            policies,
            _policy_text,
            """INSERT INTO policies (id, country, topic, title, version, effective_from, effective_to, keywords, text, synthetic,
                                     embedding, embedding_model, content_hash)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector, %s, %s)
               ON CONFLICT (id) DO UPDATE SET country = EXCLUDED.country, topic = EXCLUDED.topic, title = EXCLUDED.title,
                 version = EXCLUDED.version, effective_from = EXCLUDED.effective_from, effective_to = EXCLUDED.effective_to,
                 keywords = EXCLUDED.keywords, text = EXCLUDED.text, synthetic = EXCLUDED.synthetic,
                 embedding = COALESCE(EXCLUDED.embedding, policies.embedding),
                 embedding_model = COALESCE(EXCLUDED.embedding_model, policies.embedding_model),
                 content_hash = EXCLUDED.content_hash""",
            lambda p, t, v: (
                p["id"], p["country"], p["topic"], p["title"], p["version"], p["effective_from"], p.get("effective_to"),
                list(p["keywords"]), p["text"], bool(p.get("synthetic", True)),
                _vec(v), settings.embedding_model if v else None, _hash(t),
            ),
        )
        upsert(
            "programs",
            programs,
            _program_text,
            """INSERT INTO programs (id, institution, country, level, field, intakes, duration_months,
                                     english_overall_min, english_band_min, synthetic, city, tuition_aud_per_year, min_gpa,
                                     entry_requirement, description, embedding, embedding_model, content_hash)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector, %s, %s)
               ON CONFLICT (id) DO UPDATE SET institution = EXCLUDED.institution, country = EXCLUDED.country, level = EXCLUDED.level,
                 field = EXCLUDED.field, intakes = EXCLUDED.intakes, duration_months = EXCLUDED.duration_months,
                 english_overall_min = EXCLUDED.english_overall_min, english_band_min = EXCLUDED.english_band_min,
                 synthetic = EXCLUDED.synthetic, city = EXCLUDED.city, tuition_aud_per_year = EXCLUDED.tuition_aud_per_year,
                 min_gpa = EXCLUDED.min_gpa, entry_requirement = EXCLUDED.entry_requirement, description = EXCLUDED.description,
                 embedding = COALESCE(EXCLUDED.embedding, programs.embedding),
                 embedding_model = COALESCE(EXCLUDED.embedding_model, programs.embedding_model), content_hash = EXCLUDED.content_hash""",
            lambda p, t, v: (
                p["id"], p["institution"], p["country"], p["level"], p["field"], list(p["intakes"]), int(p["duration_months"]),
                float(p["english_overall_min"]), float(p["english_band_min"]), bool(p.get("synthetic", True)),
                p.get("city", ""), p.get("tuition_aud_per_year"), p.get("min_gpa"), p.get("entry_requirement", ""), p.get("description", ""),
                _vec(v), settings.embedding_model if v else None, _hash(t),
            ),
        )
        conn.commit()
    print(json.dumps(counts))
    return 0


if __name__ == "__main__":
    sys.exit(main())
