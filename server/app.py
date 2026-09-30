"""Flask server that orchestrates architecture article scraping + translation jobs."""
from __future__ import annotations

import json
import logging
import os
import subprocess
import threading
import time
import traceback
import uuid
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from urllib.parse import urlparse, urlunparse

from flask import Flask, Response, abort, jsonify, request, send_file
from flask_cors import CORS
from dotenv import load_dotenv

from analyzer import analyze_building_studio
from downloader import download_images
from scraper import parse_article, supported_article_url
from translator import translate_markdown, translate_text

load_dotenv(Path(__file__).with_name(".env"))


# Workspace layout (repo root = parent of this file's directory):
#   WORKSPACE_ROOT/
#   ├── projects/           <- scraped case folders live here (OUTPUT_ROOT)
#   ├── server/             <- this Flask app (+ set_case_folder_icons.sh)
#   └── tampermonkey/architecture-archive.user.js <- built userscript
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_ROOT = WORKSPACE_ROOT / "projects"
USERSCRIPT_PATH = WORKSPACE_ROOT / "tampermonkey" / "architecture-archive.user.js"
ALLOWED_ORIGINS = {"https://www.dezeen.com", "https://dezeen.com", "https://www.dwell.com", "https://archello.com", "https://www.archdaily.com"}
HOST = "127.0.0.1"
PORT = 8765
MAX_JOB_LOGS = 300
AUTO_SET_FOLDER_ICON = str(os.environ.get("AUTO_SET_FOLDER_ICON", "1")).strip().lower() not in {
    "0",
    "false",
    "no",
}
ICON_SCRIPT = Path(__file__).resolve().parent / "set_case_folder_icons.sh"

OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)


def _normalize_url(url: str) -> str:
    """Strip query string + fragment so meta.json stores a clean canonical URL.

    Dezeen pages are reached via `?utm_*=...` newsletter links etc.; those
    parameters carry no useful information for the dataset.
    """
    if not url:
        return url
    parsed = urlparse(url.strip())
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", "", ""))


def _url_path_slug(url: str) -> str:
    """Same algorithm `ParsedArticle.dir_name` uses for the trailing portion."""
    path = urlparse(url).path.strip("/")
    return path.replace("/", "-") if path else "index"


def _find_existing_dir(url: str) -> Optional[Path]:
    """Locate an already-scraped folder for this URL by matching the slug suffix."""
    slug = _url_path_slug(url)
    if not slug or not OUTPUT_ROOT.exists():
        return None
    suffix = f" - {slug}"
    for entry in OUTPUT_ROOT.iterdir():
        if not entry.is_dir():
            continue
        if entry.name.endswith(suffix) and (entry / "article.md").exists():
            return entry
    return None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("architecture_archive")

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": list(ALLOWED_ORIGINS)}})


# ---------------------------------------------------------------------------
# Job store (in-memory, single-process)
# ---------------------------------------------------------------------------

_jobs: Dict[str, Dict[str, Any]] = {}
_lock = threading.Lock()


def _initial_stages() -> List[Dict[str, Any]]:
    return [
        {"key": "upload",      "label": "上传页面",          "state": "done"},
        {"key": "parse",       "label": "解析页面",          "state": "pending"},
        {"key": "analyze",     "label": "AI 校正建筑/工作室", "state": "pending"},
        {"key": "download",    "label": "下载图片",          "state": "pending", "current": 0, "total": 0},
        {"key": "write_md",    "label": "写入 markdown",    "state": "pending"},
        {"key": "translate",   "label": "翻译为中文",        "state": "pending", "current": 0, "total": 0},
        {"key": "folder_icon", "label": "设置文件夹图标",    "state": "pending"},
    ]


def _new_job() -> str:
    job_id = uuid.uuid4().hex[:12]
    with _lock:
        _jobs[job_id] = {
            "status": "running",
            "stages": _initial_stages(),
            "dir": None,
            "error": None,
            "created_at": time.time(),
            "logs": [],
            "cancel_requested": False,
        }
    return job_id


def _update_stage(job_id: str, key: str, **fields: Any) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        for s in job["stages"]:
            if s["key"] == key:
                s.update(fields)
                break


def _set_job(job_id: str, **fields: Any) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if job:
            job.update(fields)


def _snapshot(job_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        job = _jobs.get(job_id)
        return deepcopy(job) if job else None


def _job_log(job_id: str, message: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {message}"
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        logs = job.setdefault("logs", [])
        logs.append(line)
        if len(logs) > MAX_JOB_LOGS:
            del logs[:-MAX_JOB_LOGS]


def _is_cancel_requested(job_id: str) -> bool:
    with _lock:
        job = _jobs.get(job_id)
        return bool(job and job.get("cancel_requested"))


def _request_cancel(job_id: str) -> bool:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return False
        if job.get("status") in {"done", "error", "cancelled"}:
            return True
        job["cancel_requested"] = True
        if job.get("status") == "running":
            job["status"] = "cancelling"
        return True


def _raise_if_cancelled(job_id: str) -> None:
    if _is_cancel_requested(job_id):
        raise RuntimeError("Job cancelled by user")


def _folder_icon_failure_detail(exc: BaseException, *, limit: int = 500) -> str:
    """Prefer script stderr over repr(CalledProcessError) for task logs."""
    if isinstance(exc, subprocess.CalledProcessError):
        for stream in (exc.stderr, exc.stdout):
            if stream and str(stream).strip():
                text = str(stream).strip()
                break
        else:
            text = f"exit {exc.returncode}"
        if len(text) > limit:
            return text[: limit - 1] + "…"
        return text
    if isinstance(exc, subprocess.TimeoutExpired):
        return f"超时 ({exc.timeout}s)"
    text = str(exc).strip() or type(exc).__name__
    if len(text) > limit:
        return text[: limit - 1] + "…"
    return text


def _apply_folder_icon(out_dir: Path, job_id: str) -> None:
    """Apply folder icon for one case dir; never raise to caller."""
    if not AUTO_SET_FOLDER_ICON:
        _job_log(job_id, "自动套用文件夹图标: 已关闭")
        _update_stage(job_id, "folder_icon", state="done", detail="已跳过（未启用）")
        return
    if not ICON_SCRIPT.exists():
        _job_log(job_id, f"自动套用文件夹图标: 脚本不存在 {ICON_SCRIPT}")
        _update_stage(job_id, "folder_icon", state="done", detail="已跳过（脚本不存在）")
        return
    _update_stage(job_id, "folder_icon", state="running")
    try:
        subprocess.run(
            [
                str(ICON_SCRIPT),
                "--root",
                str(OUTPUT_ROOT),
                "--test-dir",
                out_dir.name,
                "--skip-finder-restart",
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
        _job_log(job_id, "自动套用文件夹图标: 完成")
        _update_stage(job_id, "folder_icon", state="done")
    except Exception as e:
        detail = _folder_icon_failure_detail(e)
        if isinstance(e, subprocess.CalledProcessError):
            prefix = f"自动套用文件夹图标: 失败 (exit {e.returncode})"
        else:
            prefix = f"自动套用文件夹图标: 失败 {type(e).__name__}"
        _job_log(job_id, f"{prefix} {detail}")
        _update_stage(job_id, "folder_icon", state="error", detail=detail)


def _refine_building_studio(job_id: str, article) -> None:
    """Best-effort: ask the LLM to validate/replace article.building & .studio.

    Two outcomes are possible:

    - LLM returns a building name -> use (ai_building, ai_studio) directly,
      preserving article.studio when ai_studio is None.
    - LLM returns building=None -> the article is a roundup / lookbook /
      multi-project piece. Collapse to a two-segment directory name by
      using the article title as `building` and clearing `studio`.

    Updates the `analyze` stage so the user sees what happened, but never
    raises -- if the model is unreachable we keep whatever the heuristic
    scraper gave us.
    """
    _update_stage(job_id, "analyze", state="running")
    _job_log(job_id, f"AI 分析建筑/工作室 (原: {article.building} · {article.studio})")
    try:
        ai_building, ai_studio = analyze_building_studio(
            article.title, article.content_md
        )
    except Exception as e:  # defensive; analyzer already swallows requests errors
        _update_stage(job_id, "analyze", state="error", detail=f"调用失败: {type(e).__name__}")
        _job_log(job_id, f"AI 分析失败: {type(e).__name__}: {str(e)[:160]}")
        return

    changes: List[str] = []

    if ai_building is None and not ai_studio:
        # True multi-project article (roundup / lookbook / digest): use the
        # title as the directory prefix and drop studio so dir_name collapses
        # to two segments.
        new_building = article.title
        new_studio = ""
        if article.building != new_building:
            changes.append(f"building: {article.building} -> {new_building}")
            article.building = new_building
        if (article.studio or "") != new_studio:
            changes.append(f"studio: {article.studio!r} -> ''  (合辑文章)")
            article.studio = new_studio
    elif ai_building is None and ai_studio:
        # Defensive: prompt asks the model to never return null for a single
        # project, but if it still does we treat it as a single project
        # without a proper name -- fall back to the title.
        new_building = article.title
        if article.building != new_building:
            changes.append(f"building: {article.building} -> {new_building}  (LLM 未给项目名)")
            article.building = new_building
        if ai_studio != article.studio:
            changes.append(f"studio: {article.studio} -> {ai_studio}")
            article.studio = ai_studio
    else:
        if ai_building and ai_building != article.building:
            changes.append(f"building: {article.building} -> {ai_building}")
            article.building = ai_building
        if ai_studio and ai_studio != article.studio:
            changes.append(f"studio: {article.studio} -> {ai_studio}")
            article.studio = ai_studio

    if changes:
        suffix = article.studio or "(无 studio)"
        detail = f"已修正: {article.building} · {suffix}"
        _update_stage(job_id, "analyze", state="done", detail=detail)
        for line in changes:
            _job_log(job_id, f"AI 修正 {line}")
    else:
        _update_stage(
            job_id,
            "analyze",
            state="done",
            detail=f"保持原值: {article.building} · {article.studio or '(无 studio)'}",
        )
        _job_log(job_id, "AI 未给出更可靠结果，保留原值")


# ---------------------------------------------------------------------------
# Worker
# ---------------------------------------------------------------------------

def _run_job(job_id: str, url: str, html: str = "", full_translate: bool = False, article_data=None) -> None:
    try:
        _job_log(job_id, f"开始处理: {url}")
        _raise_if_cancelled(job_id)
        # 1. Parse
        _update_stage(job_id, "parse", state="running")
        _job_log(job_id, "开始解析页面")
        article = parse_article(url, html, article_data=article_data)
        for warning in (article_data or {}).get("warnings", []):
            _job_log(job_id, f"[采集提示] {warning}")
        _raise_if_cancelled(job_id)
        n_images = len(article.images)
        _update_stage(
            job_id,
            "parse",
            state="done",
            detail=f"{article.building} · {article.studio} · 找到 {n_images} 张图",
        )
        _job_log(job_id, f"页面解析完成，识别到 {n_images} 张图片")

        # 1.5 LLM-refine building/studio (best-effort; never blocks the job).
        _refine_building_studio(job_id, article)
        _raise_if_cancelled(job_id)

        # 2. Prepare output dir
        out_dir = OUTPUT_ROOT / article.dir_name
        out_dir.mkdir(parents=True, exist_ok=True)
        _set_job(job_id, dir=str(out_dir))
        log.info("[%s] output dir: %s", job_id, out_dir)
        _job_log(job_id, f"输出目录: {out_dir}")

        # 3. Download images
        _update_stage(job_id, "download", state="running", current=0, total=n_images)
        _job_log(job_id, "开始下载图片")

        def on_dl(current: int, total: int, _name: str) -> None:
            _raise_if_cancelled(job_id)
            _update_stage(job_id, "download", state="running", current=current, total=total)
            _job_log(job_id, f"图片下载进度: {current}/{total}")

        if n_images:
            saved_images = download_images(
                article.images,
                out_dir / "images",
                on_progress=on_dl,
                should_cancel=lambda: _is_cancel_requested(job_id),
            )
            if len(saved_images) != n_images:
                raise RuntimeError(f"Only {len(saved_images)}/{n_images} original images downloaded; see images/*.error.txt")
        _raise_if_cancelled(job_id)
        _update_stage(job_id, "download", state="done", current=n_images, total=n_images)
        _job_log(job_id, "图片下载完成")

        # 4. Write English markdown + meta.json
        _update_stage(job_id, "write_md", state="running")
        _job_log(job_id, "写入 article.md 和 meta.json")
        en_md = f"# {article.title}\n\n[{url}]({url})\n\n{article.content_md}"
        (out_dir / "article.md").write_text(en_md, encoding="utf-8")
        meta = {
            "url": url,
            "title": article.title,
            "building": article.building,
            "studio": article.studio,
            "image_count": n_images,
            "scraped_at": datetime.now().isoformat(timespec="seconds"),
        }
        (out_dir / "meta.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        _update_stage(job_id, "write_md", state="done")
        _job_log(job_id, "英文 markdown 写入完成")
        _raise_if_cancelled(job_id)

        # 5. Translate
        _update_stage(job_id, "translate", state="running", current=0, total=0)
        _job_log(job_id, "开始翻译")
        if full_translate:
            _job_log(job_id, "翻译模式: 一次性翻译全文")
        else:
            _job_log(job_id, "翻译模式: 分段翻译")

        def on_tr(current: int, total: int) -> None:
            _raise_if_cancelled(job_id)
            _update_stage(job_id, "translate", state="running", current=current, total=total)
            _job_log(job_id, f"翻译进度: {current}/{total}")

        def on_tr_log(message: str) -> None:
            _job_log(job_id, f"[翻译] {message}")

        zh_title = translate_text(article.title, should_cancel=lambda: _is_cancel_requested(job_id))
        _raise_if_cancelled(job_id)
        zh_body = translate_markdown(
            article.content_md,
            on_progress=on_tr,
            on_log=on_tr_log,
            should_cancel=lambda: _is_cancel_requested(job_id),
            full_text=full_translate,
        )
        zh_md = f"# {zh_title}\n\n[{url}]({url})\n\n{zh_body}"
        (out_dir / "article.zh.md").write_text(zh_md, encoding="utf-8")
        _update_stage(job_id, "translate", state="done")
        _job_log(job_id, "中文翻译写入完成")
        _apply_folder_icon(out_dir, job_id)

        _set_job(job_id, status="done")
        log.info("[%s] DONE -> %s", job_id, out_dir)
        _job_log(job_id, "任务完成")
    except Exception as e:
        if str(e) == "Job cancelled by user":
            _set_job(job_id, status="cancelled", error="Cancelled by user")
            _job_log(job_id, "任务已取消")
            with _lock:
                for s in _jobs[job_id]["stages"]:
                    if s.get("state") == "running":
                        s["state"] = "error"
                        s["detail"] = "已取消"
                        break
            return
        log.exception("[%s] failed", job_id)
        _set_job(job_id, status="error", error=f"{type(e).__name__}: {e}")
        _job_log(job_id, f"任务失败: {type(e).__name__}: {e}")
        # Mark current running stage as error.
        with _lock:
            for s in _jobs[job_id]["stages"]:
                if s.get("state") == "running":
                    s["state"] = "error"
                    s["detail"] = str(e)[:200]
                    break
        # Stash traceback for debugging.
        log.debug(traceback.format_exc())


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

def _check_origin() -> None:
    origin = request.headers.get("Origin", "")
    if origin and origin not in ALLOWED_ORIGINS:
        abort(403, description=f"origin {origin!r} not allowed")


@app.post("/jobs")
def create_job():
    _check_origin()
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "request must be a JSON object"}), 400
    url = data.get("url")
    if not isinstance(url, str) or not supported_article_url(url.strip()):
        return jsonify({"error": "url must be a Dezeen, Dwell home/article, Archello project or ArchDaily /<id>/<slug> page"}), 400
    url = _normalize_url(url.strip())
    html = data.get("html", "")
    article_data = data.get("article")
    full_translate = bool(data.get("full_translate", False))
    if urlparse(url).hostname in {"www.dwell.com", "archello.com", "www.archdaily.com"}:
        try:
            parse_article(url, article_data=article_data)
        except ValueError as error:
            return jsonify({"error": str(error)}), 400
        html = ""
    elif not isinstance(html, str) or not html.strip() or article_data is not None:
        return jsonify({"error": "Dezeen requires article HTML"}), 400
    size = len(json.dumps(article_data, ensure_ascii=False)) if article_data else len(html)
    job_id = _new_job()
    log.info("[%s] new job %s (%d characters)", job_id, url, size)
    _job_log(job_id, f"任务已创建，文章数据 {size} 字符")
    threading.Thread(
        target=_run_job, args=(job_id, url, html, full_translate),
        kwargs={"article_data": article_data}, daemon=True,
    ).start()
    return jsonify({"job_id": job_id}), 202


@app.get("/jobs/<job_id>")
def get_job(job_id: str):
    snap = _snapshot(job_id)
    if not snap:
        return jsonify({"error": "job not found"}), 404
    return jsonify(snap)


@app.post("/jobs/<job_id>/cancel")
def cancel_job(job_id: str):
    _check_origin()
    ok = _request_cancel(job_id)
    if not ok:
        return jsonify({"error": "job not found"}), 404
    _job_log(job_id, "收到取消请求")
    snap = _snapshot(job_id) or {}
    return jsonify({"ok": True, "status": snap.get("status", "unknown")})


@app.get("/scraped")
def scraped():
    """Has this URL already been scraped? Returns {scraped: bool, dir?: str}."""
    url = (request.args.get("url") or "").strip()
    if not url:
        return jsonify({"error": "missing url"}), 400
    found = _find_existing_dir(url)
    if found:
        return jsonify({"scraped": True, "dir": str(found)})
    return jsonify({"scraped": False})


@app.get("/health")
def health():
    return jsonify({"ok": True, "jobs": len(_jobs)})


@app.get("/script.user.js")
def serve_userscript():
    """Serve the Tampermonkey userscript so it can be installed/auto-updated via URL."""
    if not USERSCRIPT_PATH.exists():
        abort(404)
    return send_file(
        USERSCRIPT_PATH,
        mimetype="application/javascript; charset=utf-8",
        as_attachment=False,
        download_name="architecture-archive.user.js",
    )


@app.get("/")
def index():
    return Response(
        "<h3>Architecture Archive</h3>"
        '<p>Install/update the userscript: '
        '<a href="/script.user.js">/script.user.js</a></p>'
        '<p>Health: <a href="/health">/health</a></p>',
        mimetype="text/html",
    )


if __name__ == "__main__":
    log.info("Listening on http://%s:%d (output -> %s)", HOST, PORT, OUTPUT_ROOT)
    app.run(host=HOST, port=PORT, debug=False, threaded=True)
