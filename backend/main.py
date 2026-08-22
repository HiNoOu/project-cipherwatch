"""
FastAPI backend for the Federated Threat Intelligence Console dashboard.
"""

from state_store import STATE
from orchestrator import start_background_demo

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_demo_thread = None


@app.post("/api/demo/start")
def start_demo(
    n_institutions: int = 4,
    n_rounds: int = 20,
    round_delay_seconds: float = 1.2,
):
    global _demo_thread

    # If thread is dead or not running, reset state and start fresh
    if _demo_thread is None or not _demo_thread.is_alive():
        if hasattr(STATE, "reset"):
            STATE.reset()

        _demo_thread = start_background_demo(
            n_institutions=n_institutions,
            n_rounds=n_rounds,
            round_delay_seconds=round_delay_seconds,
        )
        return {"started": True}

    return {"started": False, "reason": "already running"}


@app.get("/api/status")
def get_status():
    snap = STATE.snapshot()
    is_alive = bool(_demo_thread and _demo_thread.is_alive())
    current_round = snap.get("round", 0)
    total_rounds = snap.get("total_rounds", 20)

    # Consider running if the background thread is actively alive
    is_live = is_alive or (0 < current_round < total_rounds)

    return {
        "global_accuracy": snap.get("global_accuracy"),
        "accuracy_delta": snap.get("accuracy_delta", 0.0),
        "institutions_online": snap.get("institutions_online", 4),
        "institutions_total": snap.get("institutions_total", 4),
        "clusters_flagged": snap.get("clusters_flagged", 0),
        "chain_integrity": snap.get(
            "chain_integrity",
            {"verified_blocks": current_round, "total_blocks": total_rounds},
        ),
        "round": current_round,
        "total_rounds": total_rounds,
        "live": is_live,
    }


@app.get("/api/accuracy-history")
def get_accuracy_history():
    with STATE._lock:
        history = list(STATE.accuracy_history)
    return {"rounds": list(range(1, len(history) + 1)), "accuracy": history}


@app.get("/api/institutions")
def get_institutions():
    return STATE.snapshot().get("institutions", {})


@app.get("/api/hero-cluster")
def get_hero_cluster():
    return STATE.snapshot().get("hero_cluster", {})


@app.get("/api/audit-log")
def get_audit_log(limit: int = 20):
    with STATE._lock:
        log = list(STATE.audit_log)
    # Return latest blocks ordered with most recent first
    return list(reversed(log[-limit:]))


@app.get("/")
def root():
    return {"service": "FTIC backend", "docs": "/docs"}
