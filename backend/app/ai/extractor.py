"""Invoice image -> structured data extraction.

This is deliberately a single, narrow function so the extraction backend can
be swapped without touching any router code. Today it calls Google's Gemini
vision model when GEMINI_API_KEY is set. Without a key, it falls back to an
empty draft so the MR can still fill the review screen in by hand -- the app
works end to end either way, extraction is just an accelerator.

To use a different provider, replace the body of extract_invoice_from_image
and keep the same return shape.
"""

import base64
import json
import os
from typing import Optional

import httpx

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
GEMINI_API_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
)

EXTRACTION_PROMPT = """You are an OCR and data-extraction engine for pharma \
sales invoices photographed on a phone. Read the invoice image and return a \
SINGLE JSON object, and nothing else (no markdown fences, no commentary), \
with exactly this shape:

{
  "invoice_number": string or null,
  "invoice_date": "YYYY-MM-DD" string or null,
  "customer_name": string or null,
  "customer_type": string or null (e.g. "Chemist", "Doctor", "Hospital", "Distributor"),
  "total_amount": number or null,
  "payment_status": one of "PAID", "PARTIAL", "UNPAID", or null,
  "paid_amount": number or null,
  "payment_mode": string or null (e.g. "Cash", "UPI", "Bank Transfer", "Cheque", "NEFT", "RTGS"),
  "remarks": string or null,
  "confidence": {
    "invoice_number": number between 0 and 1,
    "customer_name": number between 0 and 1,
    "total_amount": number between 0 and 1
  }
}

If a field is not visible or you are unsure, use null rather than guessing.
Amounts should be plain numbers (no currency symbols or commas).
"""


def _empty_draft(remarks: Optional[str] = None) -> dict:
    return {
        "invoice_number": None,
        "invoice_date": None,
        "customer_name": None,
        "customer_type": None,
        "total_amount": None,
        "payment_status": None,
        "paid_amount": None,
        "payment_mode": None,
        "remarks": remarks,
        "confidence": {"invoice_number": 0, "customer_name": 0, "total_amount": 0},
    }


async def extract_invoice_from_image(image_bytes: bytes, media_type: str = "image/jpeg") -> dict:
    if not GEMINI_API_KEY:
        return _empty_draft(
            "AI extraction is not configured (no GEMINI_API_KEY set). "
            "Please fill in the invoice details manually."
        )

    b64 = base64.b64encode(image_bytes).decode()

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                GEMINI_API_URL,
                params={"key": GEMINI_API_KEY},
                headers={"content-type": "application/json"},
                json={
                    "contents": [
                        {
                            "parts": [
                                {"text": EXTRACTION_PROMPT},
                                {
                                    "inline_data": {
                                        "mime_type": media_type,
                                        "data": b64,
                                    }
                                },
                            ]
                        }
                    ],
                    "generationConfig": {
                        "response_mime_type": "application/json",
                    },
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        return _empty_draft(f"AI extraction request failed ({exc}). Please fill in manually.")

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError):
        return _empty_draft("AI returned no usable response. Please fill in manually.")

    # Be forgiving of accidental markdown fences, even though
    # response_mime_type=application/json should prevent them.
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return _empty_draft(f"Could not parse AI response, please fill in manually. Raw: {text[:200]}")

    draft = _empty_draft()
    draft.update({k: v for k, v in parsed.items() if k in draft})
    return draft
