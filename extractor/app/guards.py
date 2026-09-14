"""Operational guards for a publicly reachable demo.

A portfolio deployment has two failure modes that a private one does not: a
crawler can run up an API bill overnight, and a stranger can upload a real
passport to a URL that was only ever meant to show synthetic data. Both are
handled here rather than being left to hope.
"""

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from threading import Lock

STATE = Path(os.getenv("STATE_DIR", "/data")) / "budget.json"


class BudgetExceeded(RuntimeError):
    pass


class DemoModeViolation(RuntimeError):
    pass


@dataclass
class Budget:
    """Daily token cap, persisted so a restart does not reset the counter.

    Deliberately not a rate limit: the thing worth capping is spend, and a
    request that reads a forty-page PDF costs far more than one that reads a
    passport page.
    """

    limit: int
    _lock: Lock = Lock()

    def _load(self) -> dict:
        today = time.strftime("%Y-%m-%d")
        if not STATE.exists():
            return {"date": today, "used": 0}
        data = json.loads(STATE.read_text())
        return data if data.get("date") == today else {"date": today, "used": 0}

    def remaining(self) -> int:
        return max(0, self.limit - self._load()["used"])

    def check(self) -> None:
        if self.remaining() <= 0:
            raise BudgetExceeded(
                "งบ token ของวันนี้หมดแล้ว เดโมสาธารณะจำกัดค่าใช้จ่ายต่อวันไว้ "
                "ลองใหม่พรุ่งนี้ หรือรันในเครื่องด้วย API key ของคุณเอง"
            )

    def record(self, tokens: int) -> None:
        with self._lock:
            data = self._load()
            data["used"] += tokens
            STATE.parent.mkdir(parents=True, exist_ok=True)
            STATE.write_text(json.dumps(data))


def assert_demo_safe(filename: str, size_bytes: int) -> None:
    """In demo mode only the synthetic corpus is accepted.

    The point is not that uploads are technically hard to handle. It is that a
    public URL which accepts identity documents is a data-protection liability,
    and the honest way to demonstrate this system is on documents nobody owns.
    """
    if os.getenv("DEMO_MODE", "false").lower() != "true":
        return

    if not filename.startswith("synth-"):
        raise DemoModeViolation(
            "เดโมสาธารณะรับเฉพาะเอกสารสังเคราะห์ที่ขึ้นต้นด้วย synth- "
            "ระบบนี้ออกแบบสำหรับข้อมูลจริงของผู้เยาว์ จึงไม่รับอัปโหลดเอกสารจริงบน URL สาธารณะ"
        )
    if size_bytes > 5 * 1024 * 1024:
        raise DemoModeViolation("ไฟล์ใหญ่เกิน 5MB")


budget = Budget(limit=int(os.getenv("DAILY_TOKEN_BUDGET", "400000")))
