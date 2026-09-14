"""Structured JSON logs.

Every extraction emits one line carrying the numbers that matter when this runs
somewhere other than a laptop: which model and prompt version produced it, how
long it took, what it cost, and how confident it was. No document content and
no field values are ever logged — only shapes and counts.
"""

import json
import logging
import sys
import time
from contextlib import contextmanager

logger = logging.getLogger("extractor")
handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(logging.Formatter("%(message)s"))
logger.addHandler(handler)
logger.setLevel(logging.INFO)


def emit(event: str, **fields) -> None:
    logger.info(json.dumps({"event": event, "ts": time.time(), **fields}))


@contextmanager
def timed(event: str, **fields):
    start = time.perf_counter()
    status = "ok"
    try:
        yield fields
    except Exception as exc:
        status = type(exc).__name__
        raise
    finally:
        emit(
            event,
            status=status,
            latency_ms=round((time.perf_counter() - start) * 1000),
            **fields,
        )
