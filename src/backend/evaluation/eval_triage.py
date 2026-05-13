"""
Triage KB Evaluation Script

Tests KB search accuracy by checking whether the top matched rule for each
test case matches the expected decision and entry_id.

Supports two modes:
  --quick   Direct KB search (no server required, fast)
  --api     Call the running Python backend at BACKEND_URL (default: http://localhost:8000)

Usage:
  PYTHONPATH=. python src/backend/evaluation/eval_triage.py --quick
  PYTHONPATH=. python src/backend/evaluation/eval_triage.py --api
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
import urllib.error
from collections import defaultdict
from pathlib import Path

# ─── Paths ────────────────────────────────────────────────────────────────────

_HERE = Path(__file__).parent
_TEST_CASES_PATH = _HERE / "test_cases.json"
_KB_PATH = Path(__file__).parent.parent / "knowledge_base" / "healthcare_kb_decision_rules.json"

BACKEND_URL = "http://localhost:8000"


# ─── Test case loader ─────────────────────────────────────────────────────────

def load_test_cases() -> list[dict]:
    with open(_TEST_CASES_PATH) as f:
        cases = json.load(f)
    return cases


# ─── Direct KB search mode ────────────────────────────────────────────────────

def _run_direct_kb(cases: list[dict]) -> list[dict]:
    """Run eval using kb_search directly (no server needed)."""
    from src.backend.knowledge_base.kb_search import load_decision_rules, search_kb
    load_decision_rules()

    results = []
    for case in cases:
        top_rules = search_kb(case["symptom"], top_k=1)
        top_rule = top_rules[0] if top_rules else None

        actual_decision = top_rule["decision"] if top_rule else None
        actual_entry_id = top_rule["id"] if top_rule else None

        decision_match = actual_decision == case["expected_decision"]
        entry_id_match = actual_entry_id == case["expected_kb_entry_id"]
        passed = decision_match and entry_id_match

        results.append({
            "id": case["id"],
            "symptom": case["symptom"],
            "category": case["category"],
            "expected_decision": case["expected_decision"],
            "expected_kb_entry_id": case["expected_kb_entry_id"],
            "actual_decision": actual_decision,
            "actual_entry_id": actual_entry_id,
            "decision_match": decision_match,
            "entry_id_match": entry_id_match,
            "passed": passed,
            "notes": case.get("notes", ""),
        })
    return results


# ─── API mode ─────────────────────────────────────────────────────────────────

def _call_triage_api(symptom: str) -> dict | None:
    payload = json.dumps({
        "symptoms": symptom,
        "severity": "medium",
        "member_id": "MBR0001",
    }).encode()
    req = urllib.request.Request(
        f"{BACKEND_URL}/api/backend/triage",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except Exception as exc:
        print(f"  [warn] API call failed: {exc}", file=sys.stderr)
        return None


def _run_api(cases: list[dict]) -> list[dict]:
    """Run eval by calling the running Python backend."""
    results = []
    for i, case in enumerate(cases, 1):
        print(f"  [{i:02d}/{len(cases)}] {case['id']} ...", end=" ", flush=True)
        data = _call_triage_api(case["symptom"])
        time.sleep(0.3)  # gentle rate limiting

        if not data or data.get("error"):
            print("ERROR")
            results.append({**case, "actual_decision": None, "actual_entry_id": None,
                             "decision_match": False, "entry_id_match": False, "passed": False})
            continue

        kb = data.get("kb_match") or {}
        actual_decision = kb.get("decision")
        actual_entry_id = kb.get("entry_id")

        decision_match = actual_decision == case["expected_decision"]
        entry_id_match = actual_entry_id == case["expected_kb_entry_id"]
        passed = decision_match and entry_id_match
        print("PASS" if passed else "FAIL")

        results.append({
            "id": case["id"],
            "symptom": case["symptom"],
            "category": case["category"],
            "expected_decision": case["expected_decision"],
            "expected_kb_entry_id": case["expected_kb_entry_id"],
            "actual_decision": actual_decision,
            "actual_entry_id": actual_entry_id,
            "decision_match": decision_match,
            "entry_id_match": entry_id_match,
            "passed": passed,
            "notes": case.get("notes", ""),
        })
    return results


# ─── Report generation ────────────────────────────────────────────────────────

def _print_report(results: list[dict], mode: str) -> None:
    total = len(results)
    passed = sum(1 for r in results if r["passed"])
    failed = total - passed
    accuracy = (passed / total * 100) if total else 0

    # Per-category breakdown
    by_category: dict[str, dict] = defaultdict(lambda: {"total": 0, "passed": 0})
    for r in results:
        cat = r["category"]
        by_category[cat]["total"] += 1
        if r["passed"]:
            by_category[cat]["passed"] += 1

    # Decision-only accuracy (ignores entry_id)
    decision_passed = sum(1 for r in results if r["decision_match"])

    print()
    print("=" * 55)
    print("  TRIAGE KB EVALUATION REPORT")
    print(f"  Mode: {mode.upper()}")
    print("=" * 55)
    print(f"  Total test cases : {total}")
    print(f"  Passed           : {passed}")
    print(f"  Failed           : {failed}")
    print(f"  Accuracy         : {accuracy:.1f}%")
    print(f"  Decision-only    : {decision_passed}/{total} ({decision_passed/total*100:.1f}%)")
    print()
    print("  Per-category breakdown:")
    for cat, stats in sorted(by_category.items()):
        cat_acc = stats["passed"] / stats["total"] * 100
        print(f"    {cat:<12} {stats['passed']}/{stats['total']} ({cat_acc:.0f}%)")

    if failed > 0:
        print()
        print("  Failed cases:")
        for r in results:
            if not r["passed"]:
                decision_status = "ok" if r["decision_match"] else f"got {r['actual_decision']}"
                entry_status = "ok" if r["entry_id_match"] else f"got {r['actual_entry_id']}"
                print(f"    {r['id']}  decision={decision_status}  entry_id={entry_status}")
                print(f"       symptom : {r['symptom'][:70]}")
                print(f"       expected: {r['expected_kb_entry_id']} → {r['expected_decision']}")
                if r["notes"]:
                    print(f"       notes   : {r['notes']}")
                print()

    print("=" * 55)


# ─── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate triage KB accuracy")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--quick", action="store_true", default=True,
                       help="Direct KB search (default, no server required)")
    group.add_argument("--api", action="store_true",
                       help="Call local Python backend at http://localhost:8000")
    args = parser.parse_args()

    mode = "api" if args.api else "quick"

    cases = load_test_cases()
    print(f"Loaded {len(cases)} test cases from {_TEST_CASES_PATH.name}")
    print(f"Running in {mode.upper()} mode...\n")

    if mode == "api":
        results = _run_api(cases)
    else:
        results = _run_direct_kb(cases)

    _print_report(results, mode)

    # Exit 1 if accuracy < 80% so CI can catch regressions
    total = len(results)
    passed = sum(1 for r in results if r["passed"])
    sys.exit(0 if (passed / total) >= 0.80 else 1)


if __name__ == "__main__":
    main()
