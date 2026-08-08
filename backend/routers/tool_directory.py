from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from database.db import SessionLocal, get_db
from database.models import ToolLink, ToolLinkHeart
from auth.dependencies import get_current_user
from uuid import UUID
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
from html.parser import HTMLParser
from ipaddress import ip_address
import socket


class _PreviewParser(HTMLParser):
    """Read the first Open Graph image without executing any page content."""

    def __init__(self):
        super().__init__()
        self.image = None

    def handle_starttag(self, tag, attrs):
        if tag != "meta" or self.image:
            return
        values = {key.lower(): value for key, value in attrs if value}
        if values.get("property", "").lower() == "og:image" or values.get("name", "").lower() == "twitter:image":
            self.image = values.get("content")


def _normalise_url(value: str) -> str:
    url = (value or "").strip()
    if not url:
        raise HTTPException(422, "A tool URL is required")
    if not urlparse(url).scheme:
        url = f"https://{url}"
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(422, "Enter a valid http(s) URL")
    return url


def _is_public_host(hostname: str) -> bool:
    """Do not let link previews fetch local/private services."""
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(hostname, None)}
        return bool(addresses) and all(not ip_address(address).is_private and not ip_address(address).is_loopback and not ip_address(address).is_link_local for address in addresses)
    except (socket.gaierror, ValueError):
        return False


def _preview_image(url: str) -> str | None:
    """Best-effort Open Graph preview. A missing preview never blocks adding a tool."""
    parsed = urlparse(url)
    if not parsed.hostname or not _is_public_host(parsed.hostname):
        return None
    try:
        request = Request(url, headers={"User-Agent": "myLabMate Tool Directory preview/1.0"})
        with urlopen(request, timeout=5) as response:
            if "text/html" not in response.headers.get("Content-Type", ""):
                return None
            body = response.read(300_000).decode(response.headers.get_content_charset() or "utf-8", errors="ignore")
        parser = _PreviewParser()
        parser.feed(body)
        return urljoin(url, parser.image) if parser.image else None
    except Exception:
        return None


def _populate_preview(tool_id: UUID, url: str) -> None:
    """Fetch metadata after responding, so opening the directory is never delayed."""
    try:
        url = _normalise_url(url)
    except HTTPException:
        return
    preview = _preview_image(url)
    if not preview:
        return
    db = SessionLocal()
    try:
        row = db.query(ToolLink).filter(ToolLink.id == tool_id).first()
        if row:
            row.url = url
        if row and not row.thumbnail_url:
            row.thumbnail_url = preview
            db.commit()
    finally:
        db.close()

router = APIRouter(prefix="/tool-directory", tags=["tool-directory"])

def serialize(row, user_id, db):
    hearts = db.query(ToolLinkHeart).filter(ToolLinkHeart.tool_link_id == row.id).count()
    hearted = db.query(ToolLinkHeart).filter(ToolLinkHeart.tool_link_id == row.id, ToolLinkHeart.user_id == user_id).first() is not None
    return {"id": str(row.id), "title": row.title, "url": row.url, "description": row.description, "thumbnail_url": row.thumbnail_url, "created_by": row.created_by, "created_at": row.created_at, "hearts": hearts, "hearted": hearted}

@router.get("")
def list_tools(response: Response, background_tasks: BackgroundTasks, sort: str = "recommended", db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    # A list which can change in the current session must not be served from browser cache.
    response.headers["Cache-Control"] = "no-store"
    rows = db.query(ToolLink).all()
    # Queue missing previews after returning the list; never delay first render.
    for row in rows:
        if not row.thumbnail_url:
            background_tasks.add_task(_populate_preview, row.id, row.url)
    data = [serialize(r, user["id"], db) for r in rows]
    key = {"name": lambda x: x["title"].lower(), "date": lambda x: x["created_at"], "recommended": lambda x: (-x["hearts"], x["title"].lower())}.get(sort, lambda x: (-x["hearts"], x["title"].lower()))
    return sorted(data, key=key, reverse=sort == "date")

@router.post("")
def create_tool(payload: dict, background_tasks: BackgroundTasks, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    url = _normalise_url(payload.get("url", ""))
    supplied_thumbnail = (payload.get("thumbnail_url") or "").strip()
    row = ToolLink(title=(payload.get("title") or "Untitled Tool").strip(), url=url, description=(payload.get("description") or "").strip(), thumbnail_url=supplied_thumbnail or None, created_by=user["id"])
    db.add(row); db.commit(); db.refresh(row)
    if not supplied_thumbnail:
        background_tasks.add_task(_populate_preview, row.id, url)
    return serialize(row, user["id"], db)

@router.post("/{tool_id}/heart")
def toggle_heart(tool_id: UUID, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    row = db.query(ToolLinkHeart).filter(ToolLinkHeart.tool_link_id == tool_id, ToolLinkHeart.user_id == user["id"]).first()
    if row: db.delete(row)
    else: db.add(ToolLinkHeart(tool_link_id=tool_id, user_id=user["id"]))
    db.commit(); return {"ok": True}

@router.delete("/{tool_id}")
def delete_tool(tool_id: UUID, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    row = db.query(ToolLink).filter(ToolLink.id == tool_id).first()
    if not row: raise HTTPException(404, "Tool not found")
    if row.created_by != user["id"] and user.get("role") not in ["manager", "owner", "admin"]: raise HTTPException(403, "Not authorized")
    db.delete(row); db.commit(); return {"ok": True}
