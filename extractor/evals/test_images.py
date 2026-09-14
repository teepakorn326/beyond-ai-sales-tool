"""Page normalisation runs before every model call, so it gets tests that
need no model."""

import base64
import io

import pytest
from PIL import Image

from app.images import MAX_SIDE, UnsupportedFile, to_pages


def png_bytes(w: int, h: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), "white").save(buf, format="PNG")
    return buf.getvalue()


def test_large_photo_is_downscaled_to_a_jpeg_page():
    pages = to_pages(png_bytes(4000, 3000), "image/png")
    assert len(pages) == 1
    media, b64 = pages[0]
    assert media == "image/jpeg"
    img = Image.open(io.BytesIO(base64.b64decode(b64)))
    assert max(img.size) == MAX_SIDE


def test_small_image_is_not_upscaled():
    media, b64 = to_pages(png_bytes(300, 200), "image/png")[0]
    img = Image.open(io.BytesIO(base64.b64decode(b64)))
    assert img.size == (300, 200)


def test_garbage_is_rejected_loudly():
    with pytest.raises(UnsupportedFile):
        to_pages(b"not an image", "image/png")
