"""
FastAPI backend for the Federated Threat Intelligence Console dashboard.

Endpoints map directly onto the dashboard mock:
  GET /api/status            -> top KPI row (accuracy, institutions online, clusters flagged, chain integrity)
  GET /api/accuracy-history  -> the "Global Accuracy Across Federated Rounds" line chart
  GET /api/institutions      -> the "Institution Status" panel
  GET /api/hero-cluster      -> the "Cluster ... Risk Score Progression" panel
  GET /api/audit-log         -> the "Audit Log - Hash-Chain Integrity" table
  POST /api/demo/start       -> kick off the federated round loop (idempotent)

Run with:  uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from state_store import STATE
from orchestrator import start_background_demo

app = FastAPI(title="FTIC Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows requests from your Railway domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_demo_thread = None


@app.post("/api/demo/start")
def start_demo(n_institutions: int = 4, n_rounds: int = 20, round_delay_seconds: float = 2.0):
    global _demo_thread
    if _demo_thread is None or not _demo_thread.is_alive():
        _demo_thread = start_background_demo(
            n_institutions=n_institutions, n_rounds=n_rounds, round_delay_seconds=round_delay_seconds
        )
        return {"started": True}
    return {"started": False, "reason": "already running"}


@app.get("/api/status")
def get_status():
    snap = STATE.snapshot()
    return {
        "global_accuracy": snap["global_accuracy"],
        "accuracy_delta": snap["accuracy_delta"],
        "institutions_online": snap["institutions_online"],
        "institutions_total": snap["institutions_total"],
        "clusters_flagged": snap["clusters_flagged"],
        "chain_integrity": snap["chain_integrity"],
        "round": snap["round"],
        "total_rounds": snap["total_rounds"],
        "live": snap["round"] > 0 and snap["round"] < snap["total_rounds"],
    }


@app.get("/api/accuracy-history")
def get_accuracy_history():
    with STATE._lock:
        history = list(STATE.accuracy_history)
    return {"rounds": list(range(1, len(history) + 1)), "accuracy": history}


@app.get("/api/institutions")
def get_institutions():
    return STATE.snapshot()["institutions"]


@app.get("/api/hero-cluster")
def get_hero_cluster():
    return STATE.snapshot()["hero_cluster"]


@app.get("/api/audit-log")
def get_audit_log(limit: int = 10):
    with STATE._lock:
        log = list(STATE.audit_log)
    return log[-limit:]


@app.get("/")
def root():
    return {"service": "FTIC backend", "docs": "/docs"}
