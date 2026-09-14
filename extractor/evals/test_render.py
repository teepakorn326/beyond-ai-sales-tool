"""POST /render: files in, JPEG pages out, no model involved."""

import base64
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


def _png(w=40, h=30) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (200, 30, 30)).save(buf, format="PNG")
    return buf.getvalue()


def _pdf_two_pages() -> bytes:
    buf = io.BytesIO()
    pages = [Image.new("RGB", (60, 80), (255, 255, 255)), Image.new("RGB", (60, 80), (0, 0, 0))]
    pages[0].save(buf, format="PDF", save_all=True, append_images=pages[1:])
    return buf.getvalue()


def _assert_jpeg_pages(files, expected_counts):
    assert [len(f["pages"]) for f in files] == expected_counts
    for f in files:
        for page in f["pages"]:
            assert page["media_type"] == "image/jpeg"
            assert Image.open(io.BytesIO(base64.b64decode(page["data"]))).format == "JPEG"


def test_render_returns_one_jpeg_page_per_image():
    client = TestClient(app)
    r = client.post("/render", files=[("files", ("photo.png", _png(), "image/png")), ("files", ("two.png", _png(), "image/png"))])
    assert r.status_code == 200, r.text
    files = r.json()["files"]
    assert [f["filename"] for f in files] == ["photo.png", "two.png"]
    _assert_jpeg_pages(files, [1, 1])


def test_render_returns_one_jpeg_page_per_pdf_page():
    pytest.importorskip("pypdfium2")
    client = TestClient(app)
    r = client.post("/render", files=[("files", ("scan.pdf", _pdf_two_pages(), "application/pdf"))])
    assert r.status_code == 200, r.text
    _assert_jpeg_pages(r.json()["files"], [2])


def test_render_rejects_a_file_that_is_not_an_image():
    client = TestClient(app)
    r = client.post("/render", files=[("files", ("notes.txt", b"hello", "text/plain"))])
    assert r.status_code == 415
