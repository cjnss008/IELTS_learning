"""Read PDF metadata locally. Nothing is uploaded; PDF bytes are never modified."""
import argparse
import json
import logging
import re
import sys

logging.getLogger("pypdf").setLevel(logging.ERROR)


def inspect_pdf(filename):
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("Install the local parser with: python -m pip install pypdf") from exc
    reader = PdfReader(filename)
    if reader.is_encrypted:
        try:
            reader.decrypt("")
        except Exception as exc:
            raise RuntimeError("Encrypted PDF; page metadata remains unverified") from exc
    count = len(reader.pages)
    samples = []
    for i in range(min(8, count)):
        try:
            text = (reader.pages[i].extract_text() or "").strip()
        except Exception:
            text = ""
        if text:
            samples.append({"page": i + 1, "characters": len(text), "heading": re.sub(r"\s+", " ", text)[:180]})
    return {"pageCount": count, "method": "local-pypdf", "textSamplePages": samples,
            "textStatus": "extractable-sample" if sum(p["characters"] for p in samples) >= 200 else "scanned-or-sparse",
            "pageNumbering": "PDF viewer pages, starting at 1; not printed page numbers"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("filename")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        print(json.dumps(inspect_pdf(args.filename), ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        sys.exit(1)
