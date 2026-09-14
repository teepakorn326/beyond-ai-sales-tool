"""Turn whatever a student sent into pages the model can read.

Phone photos arrive at 12 megapixels and PDFs arrive as PDFs. Neither should
reach the model as-is: a 4000px photo costs many times the tokens of a 1600px
one and reads no better, and a PDF has to be rendered anyway. Everything
becomes a JPEG page no wider than MAX_SIDE, in order.
"""

from __future__ import annotations

import base64
import io

from PIL import Image, ImageOps

MAX_SIDE = 1600
JPEG_QUALITY = 85
PDF_RENDER_SCALE = 2.0  # ~144 dpi; enough for print, cheap enough to send


class UnsupportedFile(ValueError):
    pass


def _encode(img: Image.Image) -> tuple[str, str]:
    img = ImageOps.exif_transpose(img)  # phone photos carry rotation in EXIF
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return "image/jpeg", base64.b64encode(buf.getvalue()).decode()


def _pdf_pages(raw: bytes) -> list[Image.Image]:
    try:
        import pypdfium2 as pdfium
    except ImportError as exc:  # pragma: no cover - environment
        raise UnsupportedFile("PDF support needs pypdfium2 installed") from exc
    doc = pdfium.PdfDocument(raw)
    return [page.render(scale=PDF_RENDER_SCALE).to_pil() for page in doc]


def _open_image(raw: bytes, content_type: str) -> Image.Image:
    if content_type in ("image/heic", "image/heif"):
        try:
            import pillow_heif  # noqa: F401  (registers the HEIF opener)
        except ImportError as exc:
            raise UnsupportedFile("HEIC needs pillow-heif installed, or send JPEG") from exc
    try:
        return Image.open(io.BytesIO(raw))
    except Exception as exc:
        raise UnsupportedFile(f"Cannot read image file: {exc}") from exc


def to_pages(raw: bytes, content_type: str) -> list[tuple[str, str]]:
    """(media_type, base64) per page, in document order."""
    if content_type == "application/pdf" or raw[:5] == b"%PDF-":
        images = _pdf_pages(raw)
    else:
        images = [_open_image(raw, content_type)]
    return [_encode(img) for img in images]
