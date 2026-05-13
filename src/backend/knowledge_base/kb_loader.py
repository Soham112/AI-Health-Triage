"""
KB Loader: Loads, embeds, and serves knowledge base entries.

Usage:
    # Embed and store all KB entries in Supabase:
    python -m src.backend.knowledge_base.kb_loader --embed --store

    # Search KB without embedding (keyword only):
    python -m src.backend.knowledge_base.kb_loader --search "chest pain radiating arm"

    # Validate KB integrity:
    python -m src.backend.knowledge_base.kb_loader --validate
"""

import json
import os
import argparse
import sys
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

KB_DIR = Path(__file__).parent
KB_FILES = {
    "triage": KB_DIR / "kb_triage.json",
    "conditions": KB_DIR / "kb_conditions.json",
    "preventive": KB_DIR / "kb_preventive.json",
}

REQUIRED_ENTRY_FIELDS = ["source", "confidence", "last_validated"]
MIN_CONFIDENCE = 0.70


@dataclass
class KBEntry:
    entry_id: str
    kb_type: str
    title: str
    content: str
    metadata: dict
    confidence: float
    source_document: str
    source_date: str
    last_validated: str


def _load_json(path: Path) -> dict:
    with open(path, "r") as f:
        return json.load(f)


def _entry_to_text(entry: dict, kb_type: str) -> str:
    """Flatten a KB entry to a text blob for embedding."""
    parts = []

    if kb_type == "triage":
        parts.append(f"Symptom: {entry.get('symptom', '')}")
        if entry.get("symptom_aliases"):
            parts.append(f"Also known as: {', '.join(entry['symptom_aliases'])}")
        parts.append(f"Recommended care setting: {entry.get('recommended_setting', '')}")
        if entry.get("reasoning"):
            parts.append(f"Reasoning: {entry['reasoning']}")
        if entry.get("red_flags"):
            parts.append(f"Red flags: {', '.join(entry['red_flags'])}")
        if entry.get("esi_level"):
            parts.append(f"ESI Level: {entry['esi_level']}")
        if entry.get("self_care_instructions"):
            parts.append(f"Self-care: {entry['self_care_instructions']}")

    elif kb_type == "conditions":
        parts.append(f"Condition: {entry.get('condition_name', '')}")
        parts.append(f"ICD-10: {entry.get('icd10_code', '')}")
        parts.append(f"Plain English: {entry.get('plain_english', '')}")
        if entry.get("symptoms"):
            parts.append(f"Symptoms: {', '.join(entry['symptoms'])}")
        if entry.get("causes"):
            parts.append(f"Causes: {', '.join(entry['causes'])}")
        if entry.get("treatment_options"):
            for tx in entry["treatment_options"]:
                tx_text = tx.get("details", tx.get("drug", tx.get("type", "")))
                parts.append(f"Treatment ({tx.get('type', 'unknown')}): {tx_text}")

    elif kb_type == "preventive":
        parts.append(f"Screening: {entry.get('screening_type', '')}")
        if entry.get("target_population"):
            pop = entry["target_population"]
            if isinstance(pop, dict):
                pop = pop.get("general", str(pop))
            parts.append(f"Target population: {pop}")
        if entry.get("recommended_tests"):
            for test in entry["recommended_tests"]:
                parts.append(f"Test: {test.get('test', '')} — {test.get('frequency', '')}")
        if entry.get("evidence"):
            ev = entry["evidence"]
            if isinstance(ev, dict):
                parts.append(f"Evidence: {ev.get('mortality_reduction', ev.get('benefit', ''))}")
        if entry.get("gaps_detection"):
            parts.append(f"Gap trigger: {entry['gaps_detection'].get('trigger', '')}")

    # Source always appended for attribution
    src = entry.get("source", {})
    if isinstance(src, dict):
        parts.append(f"Source: {src.get('document', '')} ({src.get('date', '')})")
    elif isinstance(src, str):
        parts.append(f"Source: {src}")

    return "\n".join(parts)


def _get_entry_title(entry: dict, kb_type: str) -> str:
    if kb_type == "triage":
        return entry.get("symptom", entry.get("id", ""))[:120]
    elif kb_type == "conditions":
        return entry.get("condition_name", entry.get("id", ""))
    elif kb_type == "preventive":
        return entry.get("screening_type", entry.get("id", ""))
    return entry.get("id", "")


def _get_source_document(entry: dict) -> str:
    src = entry.get("source", {})
    if isinstance(src, dict):
        return src.get("primary", {}).get("document", "") or src.get("document", "")
    return str(src)


def _get_source_date(entry: dict) -> str:
    src = entry.get("source", {})
    if isinstance(src, dict):
        return src.get("primary", {}).get("date", "") or src.get("date", "2000-01-01")
    return "2000-01-01"


def load_all_entries() -> list[KBEntry]:
    """Load all KB entries from JSON files into KBEntry objects."""
    entries = []
    for kb_type, path in KB_FILES.items():
        if not path.exists():
            print(f"WARNING: KB file not found: {path}", file=sys.stderr)
            continue
        data = _load_json(path)
        for entry in data.get("entries", []):
            entries.append(KBEntry(
                entry_id=entry["id"],
                kb_type=kb_type,
                title=_get_entry_title(entry, kb_type),
                content=_entry_to_text(entry, kb_type),
                metadata=entry,
                confidence=float(entry.get("confidence", 0.0)),
                source_document=_get_source_document(entry),
                source_date=_get_source_date(entry),
                last_validated=entry.get("last_validated", "2000-01-01"),
            ))
    return entries


def validate_kb() -> bool:
    """Validate KB integrity. Returns True if all checks pass."""
    print("=== KB Validation ===\n")
    all_pass = True

    for kb_type, path in KB_FILES.items():
        if not path.exists():
            print(f"❌ MISSING: {path}")
            all_pass = False
            continue

        data = _load_json(path)
        entries = data.get("entries", [])
        print(f"📁 {kb_type}: {len(entries)} entries")

        for entry in entries:
            entry_id = entry.get("id", "UNKNOWN")
            issues = []

            # Gate 1: Required fields
            src = entry.get("source")
            if not src:
                issues.append("missing source")
            if entry.get("confidence") is None:
                issues.append("missing confidence")
            if not entry.get("last_validated"):
                issues.append("missing last_validated")
            if not entry.get("id"):
                issues.append("missing id")

            # Gate 1: Confidence threshold
            conf = float(entry.get("confidence", 0))
            if conf < MIN_CONFIDENCE:
                issues.append(f"confidence {conf} below minimum {MIN_CONFIDENCE}")

            # Gate 1: Content not empty
            content = _entry_to_text(entry, kb_type)
            if len(content.strip()) < 20:
                issues.append("content too short (possible empty entry)")

            if issues:
                print(f"  ⚠️  {entry_id}: {', '.join(issues)}")
                all_pass = False
            else:
                print(f"  ✅ {entry_id} (confidence: {conf})")

        print()

    if all_pass:
        print("✅ All KB entries pass validation gates.\n")
    else:
        print("❌ Validation failed. Fix issues before deployment.\n")

    return all_pass


def keyword_search(query: str, kb_type: Optional[str] = None, top_k: int = 5) -> list[KBEntry]:
    """Simple keyword-based KB search (no embeddings required)."""
    entries = load_all_entries()
    query_lower = query.lower()
    query_terms = query_lower.split()

    scored = []
    for entry in entries:
        if kb_type and entry.kb_type != kb_type:
            continue
        if entry.confidence < MIN_CONFIDENCE:
            continue
        text = (entry.title + " " + entry.content).lower()
        score = sum(1 for term in query_terms if term in text)
        # Boost exact title matches
        if query_lower in entry.title.lower():
            score += 5
        if score > 0:
            scored.append((score, entry))

    scored.sort(key=lambda x: (-x[0], -x[1].confidence))
    return [e for _, e in scored[:top_k]]


def embed_and_store(dry_run: bool = False) -> None:
    """
    Embed all KB entries and store in Supabase pgvector.

    Requires:
    - OPENAI_API_KEY or ANTHROPIC_API_KEY set in environment (for embeddings)
    - SUPABASE_URL and SUPABASE_KEY set (for storage)
    """
    try:
        from src.backend.database.client import get_client
    except ImportError:
        print("❌ Cannot import Supabase client. Run from project root.", file=sys.stderr)
        sys.exit(1)

    entries = load_all_entries()
    print(f"Loaded {len(entries)} KB entries for embedding.\n")

    if dry_run:
        print("[DRY RUN] Would embed and store:")
        for e in entries:
            print(f"  {e.entry_id}: {e.title[:60]}")
        return

    embedding_fn = _get_embedding_function()
    if not embedding_fn:
        print("❌ No embedding API key found. Set OPENAI_API_KEY or COHERE_API_KEY.", file=sys.stderr)
        sys.exit(1)

    client = get_client()
    success_count = 0

    for entry in entries:
        try:
            embedding = embedding_fn(entry.content)
            data = {
                "entry_id": entry.entry_id,
                "kb_type": entry.kb_type,
                "title": entry.title,
                "content": entry.content,
                "metadata": entry.metadata,
                "embedding": embedding,
                "confidence": entry.confidence,
                "source_document": entry.source_document,
                "source_date": entry.source_date,
                "last_validated": entry.last_validated,
                "kb_version": "1.0.0",
                "is_active": True,
            }
            client.table("kb_entries").upsert(data, on_conflict="entry_id").execute()

            # Insert audit log entry
            client.table("kb_audit_log").insert({
                "entry_id": entry.entry_id,
                "action": "created",
                "kb_version": "1.0.0",
                "notes": "Initial KB load v1.0.0",
                "approved": False,
            }).execute()

            print(f"  ✅ Stored: {entry.entry_id}")
            success_count += 1

        except Exception as e:
            print(f"  ❌ Failed {entry.entry_id}: {e}", file=sys.stderr)

    print(f"\n✅ Stored {success_count}/{len(entries)} entries in Supabase.")


def _get_embedding_function():
    """Returns an embedding function based on available API keys."""
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        try:
            import openai
            client = openai.OpenAI(api_key=openai_key)
            def embed(text: str) -> list[float]:
                response = client.embeddings.create(
                    model="text-embedding-3-small",
                    input=text[:8000],  # token limit buffer
                )
                return response.data[0].embedding
            print("Using OpenAI text-embedding-3-small (1536-dim)")
            return embed
        except ImportError:
            pass

    cohere_key = os.getenv("COHERE_API_KEY")
    if cohere_key:
        try:
            import cohere
            co = cohere.Client(cohere_key)
            def embed(text: str) -> list[float]:
                response = co.embed(texts=[text[:2048]], model="embed-english-v3.0", input_type="search_document")
                return response.embeddings[0]
            print("Using Cohere embed-english-v3.0 (1024-dim — note: schema uses 1536, may need adjustment)")
            return embed
        except ImportError:
            pass

    return None


def search_and_print(query: str, kb_type: Optional[str] = None) -> None:
    """CLI search helper."""
    results = keyword_search(query, kb_type=kb_type, top_k=5)
    if not results:
        print(f"No KB entries found for: '{query}'")
        return

    print(f"\n=== KB Search Results for: '{query}' ===\n")
    for i, entry in enumerate(results, 1):
        print(f"{i}. [{entry.kb_type.upper()}] {entry.entry_id}: {entry.title}")
        print(f"   Confidence: {entry.confidence} | Source: {entry.source_document[:60]}")
        print(f"   {entry.content[:200]}...")
        print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Arlo Health KB Loader")
    parser.add_argument("--validate", action="store_true", help="Validate KB integrity")
    parser.add_argument("--embed", action="store_true", help="Generate embeddings")
    parser.add_argument("--store", action="store_true", help="Store in Supabase (use with --embed)")
    parser.add_argument("--dry-run", action="store_true", help="Dry run (no writes)")
    parser.add_argument("--search", type=str, help="Keyword search query")
    parser.add_argument("--kb-type", type=str, choices=["triage", "conditions", "preventive"],
                        help="Filter by KB type")
    args = parser.parse_args()

    if args.validate:
        ok = validate_kb()
        sys.exit(0 if ok else 1)
    elif args.search:
        search_and_print(args.search, kb_type=args.kb_type)
    elif args.embed or args.store:
        embed_and_store(dry_run=args.dry_run)
    else:
        parser.print_help()
