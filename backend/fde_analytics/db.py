import sqlite3
from datetime import datetime, timedelta, timezone


EVENTS = {
    "page_view",
    "quick_start",
    "quick_complete",
    "level_start",
    "level_complete",
    "level_unlock",
    "final_complete",
    "share_generate",
}
LEVELS = {"junior", "intermediate", "advanced"}
MODES = {"full", "mock"}
DEVICES = {"desktop", "mobile", "tablet", "other"}
ALLOWED_KEYS = {"event", "visitor_id", "session_id", "source", "device", "level", "mode", "score"}
REQUIRED_BY_EVENT = {
    "page_view": set(),
    "quick_start": set(),
    "quick_complete": {"score"},
    "level_start": {"level", "mode"},
    "level_complete": {"level", "mode", "score"},
    "level_unlock": {"level"},
    "final_complete": {"level", "mode", "score"},
    "share_generate": {"level", "mode"},
}


class ValidationError(ValueError):
    pass


def connect(db_path):
    conn = sqlite3.connect(db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def initialize(conn):
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            occurred_at TEXT NOT NULL,
            day TEXT NOT NULL,
            event TEXT NOT NULL,
            visitor_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            source TEXT NOT NULL,
            device TEXT NOT NULL,
            level TEXT,
            mode TEXT,
            score INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_events_time ON events(occurred_at);
        CREATE INDEX IF NOT EXISTS idx_events_event ON events(event);
        CREATE INDEX IF NOT EXISTS idx_events_level_mode ON events(level, mode);

        CREATE TABLE IF NOT EXISTS daily_events (
            day TEXT NOT NULL,
            event TEXT NOT NULL,
            level TEXT NOT NULL DEFAULT '',
            mode TEXT NOT NULL DEFAULT '',
            count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(day, event, level, mode)
        );
        CREATE TABLE IF NOT EXISTS daily_visitors (
            day TEXT NOT NULL,
            visitor_id TEXT NOT NULL,
            PRIMARY KEY(day, visitor_id)
        );
        CREATE TABLE IF NOT EXISTS daily_sessions (
            day TEXT NOT NULL,
            session_id TEXT NOT NULL,
            PRIMARY KEY(day, session_id)
        );
        CREATE TABLE IF NOT EXISTS daily_dimensions (
            day TEXT NOT NULL,
            dimension TEXT NOT NULL,
            label TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(day, dimension, label)
        );
        CREATE TABLE IF NOT EXISTS daily_scores (
            day TEXT NOT NULL,
            event TEXT NOT NULL,
            level TEXT NOT NULL DEFAULT '',
            bucket TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(day, event, level, bucket)
        );
        """
    )
    conn.commit()


def _plain_string(value, field, maximum=128):
    if not isinstance(value, str) or not 1 <= len(value) <= maximum:
        raise ValidationError(f"invalid {field}")
    if any(ord(char) < 32 for char in value):
        raise ValidationError(f"invalid {field}")
    return value


def validate_event(payload):
    if not isinstance(payload, dict):
        raise ValidationError("payload must be an object")
    extra = set(payload) - ALLOWED_KEYS
    if extra:
        raise ValidationError("unknown fields")
    event = payload.get("event")
    if event not in EVENTS:
        raise ValidationError("unknown event")
    normalized = {
        "event": event,
        "visitor_id": _plain_string(payload.get("visitor_id"), "visitor_id"),
        "session_id": _plain_string(payload.get("session_id"), "session_id"),
        "source": _plain_string(payload.get("source", "direct"), "source", 32).lower(),
        "device": payload.get("device", "other"),
    }
    if normalized["device"] not in DEVICES:
        raise ValidationError("invalid device")
    missing = REQUIRED_BY_EVENT[event] - set(payload)
    if missing:
        raise ValidationError("missing required fields")
    if "level" in payload:
        if payload["level"] not in LEVELS:
            raise ValidationError("invalid level")
        normalized["level"] = payload["level"]
    if "mode" in payload:
        if payload["mode"] not in MODES:
            raise ValidationError("invalid mode")
        normalized["mode"] = payload["mode"]
    if "score" in payload:
        score = payload["score"]
        if isinstance(score, bool) or not isinstance(score, int) or not 0 <= score <= 100:
            raise ValidationError("invalid score")
        normalized["score"] = score
    return normalized


def _utc(value):
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _score_bucket(score):
    if score < 60:
        return "0-59"
    if score < 70:
        return "60-69"
    if score < 80:
        return "70-79"
    if score < 90:
        return "80-89"
    return "90-100"


def record_event(conn, payload, now=None):
    event = validate_event(payload)
    instant = _utc(now or datetime.now(timezone.utc))
    occurred_at = instant.isoformat(timespec="seconds")
    day = instant.date().isoformat()
    level = event.get("level", "")
    mode = event.get("mode", "")
    with conn:
        conn.execute(
            "INSERT INTO events(occurred_at,day,event,visitor_id,session_id,source,device,level,mode,score) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (occurred_at, day, event["event"], event["visitor_id"], event["session_id"], event["source"], event["device"], level or None, mode or None, event.get("score")),
        )
        conn.execute(
            "INSERT INTO daily_events(day,event,level,mode,count) VALUES(?,?,?,?,1) ON CONFLICT(day,event,level,mode) DO UPDATE SET count=count+1",
            (day, event["event"], level, mode),
        )
        conn.execute("INSERT OR IGNORE INTO daily_visitors(day,visitor_id) VALUES(?,?)", (day, event["visitor_id"]))
        conn.execute("INSERT OR IGNORE INTO daily_sessions(day,session_id) VALUES(?,?)", (day, event["session_id"]))
        for dimension in ("source", "device"):
            conn.execute(
                "INSERT INTO daily_dimensions(day,dimension,label,count) VALUES(?,?,?,1) ON CONFLICT(day,dimension,label) DO UPDATE SET count=count+1",
                (day, dimension, event[dimension]),
            )
        if "score" in event:
            conn.execute(
                "INSERT INTO daily_scores(day,event,level,bucket,count) VALUES(?,?,?,?,1) ON CONFLICT(day,event,level,bucket) DO UPDATE SET count=count+1",
                (day, event["event"], level, _score_bucket(event["score"])),
            )
    return event


def _range_start(range_key, now):
    day = _utc(now).date()
    if range_key == "today":
        return day.isoformat()
    if range_key == "7d":
        return (day - timedelta(days=6)).isoformat()
    if range_key == "30d":
        return (day - timedelta(days=29)).isoformat()
    if range_key == "all":
        return None
    raise ValidationError("invalid range")


def _where(start):
    return (" WHERE day>=?", (start,)) if start else ("", ())


def dashboard(conn, range_key="7d", now=None):
    start = _range_start(range_key, now or datetime.now(timezone.utc))
    clause, params = _where(start)
    event_rows = conn.execute(
        "SELECT event,level,mode,SUM(count) count FROM daily_events" + clause + " GROUP BY event,level,mode",
        params,
    ).fetchall()
    funnel = {name: 0 for name in EVENTS}
    levels = {level: {"start": 0, "complete": 0, "unlock": 0} for level in ("junior", "intermediate", "advanced")}
    for row in event_rows:
        funnel[row["event"]] += row["count"]
        if row["level"] in levels:
            key = {"level_start": "start", "level_complete": "complete", "level_unlock": "unlock"}.get(row["event"])
            if key:
                levels[row["level"]][key] += row["count"]

    pv = funnel["page_view"]
    uv = conn.execute("SELECT COUNT(DISTINCT visitor_id) FROM daily_visitors" + clause, params).fetchone()[0]
    sessions = conn.execute("SELECT COUNT(DISTINCT session_id) FROM daily_sessions" + clause, params).fetchone()[0]
    daily = [dict(row) for row in conn.execute(
        "SELECT v.day, COALESCE(e.pv,0) pv, COUNT(DISTINCT v.visitor_id) uv FROM daily_visitors v "
        "LEFT JOIN (SELECT day,SUM(count) pv FROM daily_events WHERE event='page_view' GROUP BY day) e ON e.day=v.day"
        + ((" WHERE v.day>=?") if start else "") + " GROUP BY v.day ORDER BY v.day",
        params,
    ).fetchall()]

    def dimensions(name):
        dimension_clause = " WHERE dimension=?" + (" AND day>=?" if start else "")
        dimension_params = (name, start) if start else (name,)
        return [{"label": row["label"], "value": row["value"]} for row in conn.execute(
            "SELECT label,SUM(count) value FROM daily_dimensions" + dimension_clause + " GROUP BY label ORDER BY value DESC,label",
            dimension_params,
        ).fetchall()]

    score_clause = " WHERE event IN ('level_complete','final_complete')" + (" AND day>=?" if start else "")
    score_params = (start,) if start else ()
    scores = [{"bucket": row["bucket"], "value": row["value"]} for row in conn.execute(
        "SELECT bucket,SUM(count) value FROM daily_scores" + score_clause + " GROUP BY bucket ORDER BY MIN(CASE bucket WHEN '0-59' THEN 1 WHEN '60-69' THEN 2 WHEN '70-79' THEN 3 WHEN '80-89' THEN 4 ELSE 5 END)",
        score_params,
    ).fetchall()]
    return {
        "range": range_key,
        "summary": {"pv": pv, "uv": uv, "sessions": sessions},
        "daily": daily,
        "funnel": funnel,
        "levels": levels,
        "sources": dimensions("source"),
        "devices": dimensions("device"),
        "scores": scores,
    }


def purge_old_events(conn, now=None, retention_days=180):
    cutoff = (_utc(now or datetime.now(timezone.utc)) - timedelta(days=retention_days)).isoformat(timespec="seconds")
    with conn:
        cursor = conn.execute("DELETE FROM events WHERE occurred_at<?", (cutoff,))
    return cursor.rowcount
