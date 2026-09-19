#!/usr/bin/env python3
"""Generates the sample visit summary PDF used by CareRelay's document intake demo.

Kept as a script (rather than a binary blob with no provenance) so the demo
document can be edited and regenerated. Writes to
artifacts/care-relay/public/sample-visit-summary.pdf.

Usage: python3 scripts/src/make-sample-document.py
"""

import pathlib

LINES = [
    ("Helvetica-Bold", 16, "Lakeside Family Medicine"),
    ("Helvetica", 10, "1420 Ridgeway Avenue, Pittsburgh, PA 15213  |  (412) 555-0188"),
    ("Helvetica", 10, ""),
    ("Helvetica-Bold", 13, "Office Visit Summary"),
    ("Helvetica", 10, ""),
    ("Helvetica", 11, "Patient: Margaret Wilson"),
    ("Helvetica", 11, "Date of visit: October 14, 2024"),
    ("Helvetica", 11, "Seen by: Maya Patel, MD"),
    ("Helvetica", 10, ""),
    ("Helvetica-Bold", 12, "Reason for visit"),
    ("Helvetica", 11, "Routine follow-up for blood pressure management. Daughter present."),
    ("Helvetica", 10, ""),
    ("Helvetica-Bold", 12, "Reported since last visit"),
    ("Helvetica", 11, "Patient reports occasional dizziness when standing up quickly,"),
    ("Helvetica", 11, "most often in the morning. No falls reported. Appetite unchanged."),
    ("Helvetica", 11, "Family reports she has seemed more tired in the afternoons."),
    ("Helvetica", 10, ""),
    ("Helvetica-Bold", 12, "Medications"),
    ("Helvetica", 11, "Continue lisinopril 10 mg once daily."),
    ("Helvetica", 11, "Continue vitamin D 1000 IU once daily with breakfast."),
    ("Helvetica", 11, "No changes made at this visit."),
    ("Helvetica", 10, ""),
    ("Helvetica-Bold", 12, "Plan and recommendations"),
    ("Helvetica", 11, "1. Encourage hydration throughout the day."),
    ("Helvetica", 11, "2. Advise standing up slowly from seated or lying positions."),
    ("Helvetica", 11, "3. Continue the home stretching routine each morning."),
    ("Helvetica", 11, "4. Family to record any further dizziness episodes."),
    ("Helvetica", 10, ""),
    ("Helvetica-Bold", 12, "Follow-up"),
    ("Helvetica", 11, "Schedule a follow-up with primary care in 2-4 weeks."),
    ("Helvetica", 11, "Physical therapy evaluation is scheduled; the clinic will call"),
    ("Helvetica", 11, "to confirm the appointment time."),
    ("Helvetica", 10, ""),
    ("Helvetica", 9, "This summary is provided for the patient and their care circle."),
]


def escape(text: str) -> str:
    return text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def build_pdf() -> bytes:
    y = 760
    parts = ["BT"]
    for font, size, text in LINES:
        if text:
            parts.append(f"/{font} {size} Tf")
            parts.append(f"1 0 0 1 60 {y} Tm")
            parts.append(f"({escape(text)}) Tj")
        y -= size + 6
    parts.append("ET")
    stream = "\n".join(parts).encode("latin-1")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /Helvetica 5 0 R /Helvetica-Bold 6 0 R >> >> "
        b"/Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{index} 0 obj\n".encode() + body + b"\nendobj\n"

    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_at}\n%%EOF\n"
    ).encode()
    return bytes(out)


if __name__ == "__main__":
    target = (
        pathlib.Path(__file__).resolve().parents[2]
        / "artifacts/care-relay/public/sample-visit-summary.pdf"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(build_pdf())
    print(f"Wrote {target} ({target.stat().st_size} bytes)")
