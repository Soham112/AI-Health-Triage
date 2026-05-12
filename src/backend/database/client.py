"""
Supabase client with lazy initialization, connection pool concept, and retry logic.
Falls back to in-memory mock mode when SUPABASE_URL/KEY are not set.
"""

from __future__ import annotations

import logging
import time
from functools import lru_cache
from typing import Any, Optional

logger = logging.getLogger(__name__)

# In-memory fallback store for development without Supabase
_in_memory_store: dict[str, list[dict]] = {
    "members": [],
    "claims": [],
    "triage_outcomes": [],
    "chat_history": [],
    "audit_logs": [],
    "preventive_campaigns": [],
}


class SupabaseClientError(Exception):
    pass


class MockSupabaseTable:
    """Minimal Supabase table API mimic for local dev / test mode."""

    def __init__(self, table: str):
        self._table = table

    def _get_store(self) -> list[dict]:
        return _in_memory_store.setdefault(self._table, [])

    def select(self, *args, **kwargs) -> "MockSupabaseTable":
        return self

    def insert(self, data: dict | list[dict]) -> "MockSupabaseTable":
        store = self._get_store()
        rows = data if isinstance(data, list) else [data]
        store.extend(rows)
        self._last_rows = rows
        return self

    def update(self, data: dict) -> "MockSupabaseTable":
        self._pending_update = data
        return self

    def eq(self, column: str, value: Any) -> "MockSupabaseTable":
        self._filter_col = column
        self._filter_val = value
        return self

    def order(self, column: str, **kwargs) -> "MockSupabaseTable":
        return self

    def limit(self, n: int) -> "MockSupabaseTable":
        self._limit = n
        return self

    def execute(self) -> "MockResult":
        store = self._get_store()
        col = getattr(self, "_filter_col", None)
        val = getattr(self, "_filter_val", None)
        if col and val is not None:
            rows = [r for r in store if str(r.get(col)) == str(val)]
        else:
            rows = list(store)

        limit = getattr(self, "_limit", None)
        if limit:
            rows = rows[:limit]

        return MockResult(rows)


class MockResult:
    def __init__(self, data: list[dict]):
        self.data = data
        self.error = None


class MockSupabase:
    def table(self, name: str) -> MockSupabaseTable:
        return MockSupabaseTable(name)

    def rpc(self, fn: str, params: dict) -> MockResult:
        return MockResult([])


class DBClient:
    """
    Thin wrapper around supabase-py with:
    - Lazy initialization (only imports supabase if env vars are set)
    - Transparent fallback to in-memory mock
    - Retry with exponential backoff for transient failures
    """

    def __init__(self):
        self._client = None
        self._mock_mode = False

    def _init_client(self):
        if self._client is not None:
            return

        try:
            from src.backend.config import settings
            if not settings.supabase_configured:
                logger.warning("Supabase not configured — running in mock mode")
                self._client = MockSupabase()
                self._mock_mode = True
                return

            from supabase import create_client
            self._client = create_client(settings.supabase_url, settings.supabase_key)
            logger.info("Supabase client initialized")
        except Exception as exc:
            logger.warning(f"Supabase init failed ({exc}) — falling back to mock mode")
            self._client = MockSupabase()
            self._mock_mode = True

    @property
    def client(self):
        self._init_client()
        return self._client

    @property
    def is_mock(self) -> bool:
        self._init_client()
        return self._mock_mode

    def execute_with_retry(self, fn, max_retries: int = 3, base_delay: float = 0.5):
        """Execute a callable with exponential backoff on transient errors."""
        last_exc = None
        for attempt in range(max_retries):
            try:
                return fn()
            except Exception as exc:
                last_exc = exc
                if attempt < max_retries - 1:
                    delay = base_delay * (2 ** attempt)
                    logger.warning(f"DB operation failed (attempt {attempt + 1}): {exc}. Retrying in {delay}s")
                    time.sleep(delay)
        raise SupabaseClientError(f"DB operation failed after {max_retries} attempts: {last_exc}") from last_exc


@lru_cache(maxsize=1)
def get_db() -> DBClient:
    return DBClient()


db = get_db()
