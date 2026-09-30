"""LLM-based refinement of (building, studio) extraction.

Dezeen's article markup is inconsistent: not every project page exposes a
"X by Y" caption that the regex scraper can latch onto. When the heuristics
miss, we fall back to asking an LLM (DeepSeek by default; OpenAI / Gemini
also supported) to read the article body and return the canonical project
name + lead studio.

Public API:
    analyze_building_studio(title, body) -> (building | None, studio | None)

A return value of (None, None) means the caller should keep whatever the
heuristic scraper produced.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Optional, Tuple

import requests

log = logging.getLogger(__name__)


DEEPSEEK_API_BASE = "https://api.deepseek.com/chat/completions"
DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash"
OPENAI_API_BASE = "https://api.openai.com/v1/chat/completions"
OPENAI_DEFAULT_MODEL = "gpt-4.1-mini"
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_DEFAULT_MODEL = "gemini-2.5-flash"

# How much of the article body to feed the model. 6 KB is plenty for Dezeen
# articles -- the project name and lead studio are essentially always in the
# first few paragraphs.
DEFAULT_BODY_CHARS = 6000

_PROMPT_TEMPLATE = """You extract structured metadata from architecture/design articles (Dezeen or Dwell).

Given the TITLE and BODY of one article, identify two fields.

1. "building": the name of the SINGLE main project featured -- a house,
   building, interior, restaurant, office, co-working space, shop, product,
   etc.

   - If the project has a PROPER name, return only the bare name -- no
     location, no description. Examples:
       "Openfield House", "Casa 144\u00ba", "The Chodge", "Birdhouse ADU",
       "Westview Cottage", "Live Sawn House", "Maison du Lac Perdu".
   - If the article still focuses on ONE project but the studio never gave
     it a proper name (common for co-working spaces, cafes, restaurants,
     offices, retail interiors, painting studios, etc.), return a short
     descriptive label of at most ~6 words. Keep the location + project
     type so the label uniquely identifies the project.
     Examples:
       "Berlin co-working space",
       "Tokyo cafe interior",
       "Brooklyn restaurant lounge",
       "Ontario painting studio",
       "London office refurbishment".
   - Return null ONLY when the article covers MULTIPLE separate projects --
     i.e. roundups, lookbooks, "Top 10" lists, news digests, general industry
     news. A single-project profile must always have a non-null building.

2. "studio": the architecture studio, designer, or design firm responsible
   for that project. Examples: "Keshaw McArthur", "Hollaway Studio",
   "Office of Tangible Space", "Jaime Prous Architects", "Bruzkus Greenberg".
   If multiple firms collaborated, return only the LEAD firm (usually the
   one credited first or as architect). If unknown, return null.

Output strictly ONE JSON object with exactly the keys "building" and
"studio". No prose, no markdown, no code fences. Preserve original casing
and diacritics. Use null (not the string "null") when a field is unknown.

TITLE:
{title}

BODY:
{body}
"""


def _provider() -> str:
    """Pick provider for analysis. Falls back to TRANSLATION_PROVIDER, then deepseek."""
    val = (
        os.environ.get("ANALYSIS_PROVIDER")
        or os.environ.get("TRANSLATION_PROVIDER")
        or "deepseek"
    )
    return val.strip().lower() or "deepseek"


def _truncate_body(text: str, limit: int = DEFAULT_BODY_CHARS) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit] + "\n\n... [truncated] ..."


def analyze_building_studio(
    title: str,
    body: str,
    timeout: float = 45.0,
) -> Tuple[Optional[str], Optional[str]]:
    """Ask the configured LLM to extract (building, studio) from the article.

    Each return slot may be None when the model declines or the call fails.
    Never raises; failures are logged and surfaced as (None, None).
    """
    if not (title and body):
        return None, None

    provider = _provider()
    prompt = _PROMPT_TEMPLATE.format(
        title=(title or "").strip(),
        body=_truncate_body(body),
    )
    try:
        raw = _call(provider, prompt, timeout=timeout)
    except Exception as e:
        log.warning("analyzer: %s call failed: %s", provider, e)
        return None, None

    if not raw:
        return None, None

    try:
        data = _extract_json(raw)
    except ValueError as e:
        log.warning("analyzer: %s returned non-JSON: %s | raw=%r", provider, e, raw[:200])
        return None, None

    return _clean_value(data.get("building")), _clean_value(data.get("studio"))


_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def _extract_json(text: str) -> dict:
    text = (text or "").strip()
    if text.startswith("```"):
        # Strip a leading ```json / ```\n and trailing ```
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```\s*$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = _JSON_OBJECT_RE.search(text)
        if not m:
            raise ValueError(f"no JSON object in response: {text[:200]!r}")
        return json.loads(m.group(0))


def _clean_value(v) -> Optional[str]:
    if v is None:
        return None
    if not isinstance(v, str):
        v = str(v)
    s = v.strip()
    if not s:
        return None
    # Some models return the literal string "null" / "none" / "n/a".
    if s.lower() in {"null", "none", "n/a", "unknown", "unknown studio"}:
        return None
    return s


def _call(provider: str, prompt: str, timeout: float) -> str:
    if provider == "deepseek":
        return _call_deepseek(prompt, timeout)
    if provider == "openai":
        return _call_openai(prompt, timeout)
    if provider == "gemini":
        return _call_gemini(prompt, timeout)
    raise RuntimeError(f"Unsupported analysis provider: {provider!r}")


_SYSTEM_MSG = (
    "You extract structured metadata from architecture / design articles "
    "and reply with a single raw JSON object only."
)


def _call_deepseek(prompt: str, timeout: float) -> str:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Missing DEEPSEEK_API_KEY")
    model = (os.environ.get("DEEPSEEK_MODEL") or DEEPSEEK_DEFAULT_MODEL).strip()
    payload = {
        "model": model or DEEPSEEK_DEFAULT_MODEL,
        "temperature": 0.0,
        "thinking": {"type": "disabled"},
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": _SYSTEM_MSG},
            {"role": "user", "content": prompt},
        ],
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    resp = requests.post(DEEPSEEK_API_BASE, headers=headers, json=payload, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()


def _call_openai(prompt: str, timeout: float) -> str:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Missing OPENAI_API_KEY")
    model = (os.environ.get("OPENAI_MODEL") or OPENAI_DEFAULT_MODEL).strip()
    payload = {
        "model": model or OPENAI_DEFAULT_MODEL,
        "temperature": 0.0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": _SYSTEM_MSG},
            {"role": "user", "content": prompt},
        ],
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    resp = requests.post(OPENAI_API_BASE, headers=headers, json=payload, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()


def _call_gemini(prompt: str, timeout: float) -> str:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Missing GEMINI_API_KEY")
    model = (os.environ.get("GEMINI_MODEL") or GEMINI_DEFAULT_MODEL).strip()
    url = f"{GEMINI_API_BASE}/{model or GEMINI_DEFAULT_MODEL}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.0,
            "responseMimeType": "application/json",
        },
    }
    resp = requests.post(url, json=payload, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    return (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "")
        .strip()
    )
