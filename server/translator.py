"""Translate markdown to Simplified Chinese using Gemini/OpenAI/DeepSeek."""
from __future__ import annotations

import logging
import os
import re
import time
from typing import Callable, List, Optional

import requests

log = logging.getLogger(__name__)


# Larger chunk improves throughput for LLM-based translation providers.
DEFAULT_MAX_CHARS = 12000
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_DEFAULT_MODEL = "gemini-2.5-flash"
OPENAI_API_BASE = "https://api.openai.com/v1/chat/completions"
OPENAI_DEFAULT_MODEL = "gpt-4.1-mini"
DEEPSEEK_API_BASE = "https://api.deepseek.com/chat/completions"
DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash"
DEFAULT_CONNECT_TIMEOUT = 10.0
DEFAULT_READ_TIMEOUT = 180.0

ProgressCb = Callable[[int, int], None]
"""(current_segments_done, total_segments)"""
LogCb = Callable[[str], None]
CancelCb = Callable[[], bool]


def _split_paragraphs(text: str) -> List[str]:
    """Split markdown by blank lines, keeping the separators."""
    parts = re.split(r"(\n\s*\n)", text)
    # parts alternates: [content, sep, content, sep, ...]
    segments: List[str] = []
    buf = ""
    for chunk in parts:
        if re.fullmatch(r"\n\s*\n", chunk or ""):
            if buf:
                segments.append(buf)
                buf = ""
            segments.append(chunk)
        else:
            buf += chunk
    if buf:
        segments.append(buf)
    return segments


def _chunk_limit() -> int:
    raw = os.environ.get("TRANSLATE_MAX_CHARS", "").strip()
    if not raw:
        return DEFAULT_MAX_CHARS
    try:
        return max(1000, int(raw))
    except ValueError:
        return DEFAULT_MAX_CHARS


def _request_timeout() -> tuple[float, float]:
    """Return requests' (connect, read) timeout pair for translation calls."""
    raw = os.environ.get("TRANSLATE_READ_TIMEOUT", "").strip()
    if not raw:
        return DEFAULT_CONNECT_TIMEOUT, DEFAULT_READ_TIMEOUT
    try:
        read_timeout = max(1.0, float(raw))
    except ValueError:
        read_timeout = DEFAULT_READ_TIMEOUT
    return DEFAULT_CONNECT_TIMEOUT, read_timeout


def _further_split_long(seg: str, limit: Optional[int] = None) -> List[str]:
    limit = limit or _chunk_limit()
    if len(seg) <= limit:
        return [seg]
    # Try splitting on sentence boundaries first.
    sentences = re.split(r"(?<=[.!?])\s+", seg)
    chunks: List[str] = []
    cur = ""
    for s in sentences:
        if len(cur) + len(s) + 1 > limit and cur:
            chunks.append(cur)
            cur = s
        else:
            cur = (cur + " " + s).strip() if cur else s
    if cur:
        chunks.append(cur)
    # If a single sentence is still too long, hard-cut.
    final: List[str] = []
    for c in chunks:
        if len(c) <= limit:
            final.append(c)
        else:
            for i in range(0, len(c), limit):
                final.append(c[i : i + limit])
    return final


# Matches a paragraph that consists solely of one or more markdown image
# references (with optional CommonMark angle-bracket URL form).
_IMAGE_ONLY_RE = re.compile(r"^\s*(?:!\[[^\]]*\]\(<?[^)>\s][^)>]*>?\)\s*)+\s*$")


def _looks_translatable(s: str) -> bool:
    """Skip whitespace-only, pure-symbol, or image-only segments."""
    stripped = s.strip()
    if not stripped:
        return False
    if _IMAGE_ONLY_RE.match(stripped):
        return False
    # If it has no ASCII letters, no need to translate (URLs/symbols only).
    return bool(re.search(r"[A-Za-z]", stripped))


def translate_markdown(
    text: str,
    on_progress: Optional[ProgressCb] = None,
    on_log: Optional[LogCb] = None,
    should_cancel: Optional[CancelCb] = None,
    full_text: bool = False,
    target: str = "zh-CN",
    source: str = "en",
) -> str:
    """Translate markdown text paragraph-by-paragraph; keep blank-line separators verbatim."""
    if not text.strip():
        if on_progress:
            on_progress(0, 0)
        return text

    provider = _provider()
    _validate_provider_config()
    chunk_limit = _chunk_limit()
    if on_log:
        on_log(f"翻译引擎: {provider}; 单段上限: {chunk_limit} 字符")

    if full_text:
        if on_progress:
            on_progress(0, 1)
        if on_log:
            on_log("已选择一次性翻译全文模式")
        out = _translate_with_retry(
            text,
            target=target,
            source=source,
            on_log=on_log,
            seg_no=1,
            seg_total=1,
            should_cancel=should_cancel,
        )
        if on_progress:
            on_progress(1, 1)
        return out if out else text

    segments = _split_paragraphs(text)

    # Pre-expand long paragraphs so each translator call is bounded.
    expanded: List[str] = []
    for seg in segments:
        if re.fullmatch(r"\n\s*\n", seg or ""):
            expanded.append(seg)
        else:
            expanded.extend(_further_split_long(seg, limit=chunk_limit))

    translatable_indices = [i for i, s in enumerate(expanded) if _looks_translatable(s)]
    total = len(translatable_indices)
    if on_progress:
        on_progress(0, total)

    done = 0
    for i in translatable_indices:
        if should_cancel and should_cancel():
            if on_log:
                on_log("检测到取消请求，终止翻译")
            raise RuntimeError("Job cancelled by user")
        original = expanded[i]
        translated = _translate_with_retry(
            original,
            target=target,
            source=source,
            on_log=on_log,
            seg_no=done + 1,
            seg_total=total,
            should_cancel=should_cancel,
        )
        expanded[i] = translated if translated else original
        done += 1
        if on_progress:
            on_progress(done, total)

    return "".join(expanded)


def _translate_with_retry(
    text: str,
    target: str = "zh-CN",
    source: str = "en",
    on_log: Optional[LogCb] = None,
    seg_no: Optional[int] = None,
    seg_total: Optional[int] = None,
    should_cancel: Optional[CancelCb] = None,
    attempts: int = 4,
    base_delay: float = 1.0,
) -> Optional[str]:
    """Retry transient model provider failures."""
    last_err: Optional[Exception] = None
    attempts_used = 0
    for i in range(attempts):
        if should_cancel and should_cancel():
            raise RuntimeError("Job cancelled by user")
        attempt_no = i + 1
        attempts_used = attempt_no
        try:
            out = _translate_once(text, target=target, source=source)
            if out and out.strip():
                if on_log:
                    prefix = f"[{seg_no}/{seg_total}] " if seg_no and seg_total else ""
                    on_log(f"{prefix}第 {attempt_no} 次调用成功")
                return out
            last_err = _EmptyTranslationError("empty translation")
        except Exception as e:
            last_err = e
            if on_log:
                prefix = f"[{seg_no}/{seg_total}] " if seg_no and seg_total else ""
                on_log(
                    f"{prefix}第 {attempt_no} 次调用失败: "
                    f"{type(e).__name__}: {str(e)[:180]}"
                )
            if not _is_retryable_error(e):
                log.warning("translate failed with non-retryable error: %s", e)
                if on_log:
                    on_log(f"{prefix}错误不可重试，保留原文")
                return None
        if attempt_no < attempts:
            _wait_before_retry(base_delay * (2 ** i), should_cancel)
    log.warning("translate failed after %d attempts: %s", attempts_used, last_err)
    if on_log:
        prefix = f"[{seg_no}/{seg_total}] " if seg_no and seg_total else ""
        on_log(f"{prefix}调用 {attempts_used} 次后仍失败，保留原文")
    return None


class _EmptyTranslationError(Exception):
    """Raised when a provider returns no translated text."""


def _is_retryable_error(error: Exception) -> bool:
    if isinstance(
        error,
        (
            _EmptyTranslationError,
            requests.exceptions.ConnectionError,
            requests.exceptions.Timeout,
        ),
    ):
        return True
    if isinstance(error, requests.exceptions.HTTPError):
        response = error.response
        status = response.status_code if response is not None else None
        return status == 429 or (status is not None and status >= 500)
    return False


def _wait_before_retry(seconds: float, should_cancel: Optional[CancelCb]) -> None:
    end = time.time() + seconds
    while time.time() < end:
        if should_cancel and should_cancel():
            raise RuntimeError("Job cancelled by user")
        time.sleep(0.1)


def translate_text(
    text: str, target: str = "zh-CN", source: str = "en", should_cancel: Optional[CancelCb] = None
) -> str:
    """Translate a single short string (e.g. the title)."""
    if not text.strip():
        return text
    _validate_provider_config()
    out = _translate_with_retry(text, target=target, source=source, should_cancel=should_cancel)
    return out if out else text


def _provider() -> str:
    return (os.environ.get("TRANSLATION_PROVIDER", "gemini").strip().lower() or "gemini")


def _validate_provider_config() -> None:
    provider = _provider()
    if provider == "gemini":
        _require_gemini_api_key()
        return
    if provider == "openai":
        _require_openai_api_key()
        return
    if provider == "deepseek":
        _require_deepseek_api_key()
        return
    raise RuntimeError("Invalid TRANSLATION_PROVIDER. Use 'gemini', 'openai', or 'deepseek'.")


def _translate_once(text: str, target: str = "zh-CN", source: str = "en") -> str:
    provider = _provider()
    if provider == "openai":
        return _translate_with_openai(text, target=target, source=source)
    if provider == "deepseek":
        return _translate_with_deepseek(text, target=target, source=source)
    return _translate_with_gemini(text, target=target, source=source)


def _require_gemini_api_key() -> str:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Missing GEMINI_API_KEY environment variable.")
    return api_key


def _require_openai_api_key() -> str:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Missing OPENAI_API_KEY environment variable.")
    return api_key


def _require_deepseek_api_key() -> str:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Missing DEEPSEEK_API_KEY environment variable.")
    return api_key


def _translate_with_gemini(text: str, target: str = "zh-CN", source: str = "en") -> str:
    api_key = _require_gemini_api_key()
    model = os.environ.get("GEMINI_MODEL", GEMINI_DEFAULT_MODEL).strip() or GEMINI_DEFAULT_MODEL
    url = f"{GEMINI_API_BASE}/{model}:generateContent?key={api_key}"

    prompt = (
        "You are a professional translation engine.\n"
        f"Translate the following text from {source} to {target}.\n"
        "Strict rules:\n"
        "1) Preserve Markdown syntax exactly.\n"
        "2) Do NOT change URLs, image paths, file names, or code blocks.\n"
        "3) Keep paragraph structure and line breaks.\n"
        "4) Output only the translated text.\n\n"
        f"Text:\n{text}"
    )

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.1},
    }
    resp = requests.post(url, json=payload, timeout=_request_timeout())
    resp.raise_for_status()
    data = resp.json()
    return (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "")
        .strip()
    )


def _translate_with_openai(text: str, target: str = "zh-CN", source: str = "en") -> str:
    api_key = _require_openai_api_key()
    model = os.environ.get("OPENAI_MODEL", OPENAI_DEFAULT_MODEL).strip() or OPENAI_DEFAULT_MODEL

    prompt = (
        f"Translate the following text from {source} to {target}.\n"
        "Strict rules:\n"
        "1) Preserve Markdown syntax exactly.\n"
        "2) Do NOT change URLs, image paths, file names, or code blocks.\n"
        "3) Keep paragraph structure and line breaks.\n"
        "4) Output only the translated text."
    )
    payload = {
        "model": model,
        "temperature": 0.1,
        "messages": [
            {"role": "system", "content": "You are a professional translation engine."},
            {"role": "user", "content": f"{prompt}\n\nText:\n{text}"},
        ],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    resp = requests.post(
        OPENAI_API_BASE,
        headers=headers,
        json=payload,
        timeout=_request_timeout(),
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()


def _translate_with_deepseek(text: str, target: str = "zh-CN", source: str = "en") -> str:
    api_key = _require_deepseek_api_key()
    model = (
        os.environ.get("DEEPSEEK_MODEL", DEEPSEEK_DEFAULT_MODEL).strip()
        or DEEPSEEK_DEFAULT_MODEL
    )

    prompt = (
        f"Translate the following text from {source} to {target}.\n"
        "Strict rules:\n"
        "1) Preserve Markdown syntax exactly.\n"
        "2) Do NOT change URLs, image paths, file names, or code blocks.\n"
        "3) Keep paragraph structure and line breaks.\n"
        "4) Output only the translated text."
    )
    payload = {
        "model": model,
        "temperature": 0.1,
        "thinking": {"type": "disabled"},
        "messages": [
            {"role": "system", "content": "You are a professional translation engine."},
            {"role": "user", "content": f"{prompt}\n\nText:\n{text}"},
        ],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    resp = requests.post(
        DEEPSEEK_API_BASE,
        headers=headers,
        json=payload,
        timeout=_request_timeout(),
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
