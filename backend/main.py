"""
FastAPI backend for the Federated Threat Intelligence Console dashboard.
"""

import asyncio
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hash_chain import HashChain
from synthetic_data import Hero_ClusterID

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

INSTITUTION_LABELS = {
    1: "EXCHANGE (Alpha)",
    2: "FORENSIC FIRM (ChainScan)",
    3: "BANK (Global Trust)",
    4: "BANK / SETTLEMENT (Nexus)",
}

# Global State Container
class DashboardState:
    def __init__(self):
        self.reset()

    def reset(self):
        self.round = 0
        self.total_rounds = 20
        self.global_accuracy = None
        self.accuracy_delta = 0.0
        self.institutions_online = 4
        self.institutions_total = 4
        self.clusters_flagged = 0
        self.chain_integrity = {"verified_blocks": 0, "total_blocks": 20}
        self.institutions = {
            "NODE_A": {"label": "EXCHANGE (Alpha)", "status": "SYNCED"},
            "NODE_B": {"label": "FORENSIC FIRM (ChainScan)", "status": "SYNCED"},
            "NODE_C": {"label": "BANK (Global Trust)", "status": "SYNCED"},
            "NODE_D": {"label": "BANK / SETTLEMENT (Nexus)", "status": "SYNCED"},
        }
        self.hero_cluster = {
            "id": Hero_ClusterID if "Hero_ClusterID" in globals() else "CLUSTER_HERO_0X7A2",
            "wallet_count": 14,
            "local_score": 0.40,
            "local_label": "LOW-RISK",
            "global_score": 0.00,
            "global_label": "AWAITING",
        }
        self.accuracy_history = []
        self.audit_log = []
        self.is_running = False

STATE = DashboardState()
_current_task = None


async def run_simulation_worker(n_rounds: int = 20, round_delay: float = 1.2):
    STATE.is_running = True
    chain = HashChain()
    base_acc = 0.52

    try:
        for r in range(1, n_rounds + 1):
            await asyncio.sleep(round_delay)

            # 1. Progression Math
            delta = round(0.022 + (0.012 / r), 4)
            base_acc = min(0.965, round(base_acc + delta, 4))
            
            local_hero = 0.40
            global_hero = round(min(0.96, 0.40 + (r * 0.035)), 2)

            # 2. Node D blinks syncing every 3 rounds
            inst_status = {
                "NODE_A": {"label": "EXCHANGE (Alpha)", "status": "SYNCED"},
                "NODE_B": {"label": "FORENSIC FIRM (ChainScan)", "status": "SYNCED"},
                "NODE_C": {"label": "BANK (Global Trust)", "status": "SYNCED"},
                "NODE_D": {
                    "label": "BANK / SETTLEMENT (Nexus)",
                    "status": "SYNCING" if r % 3 == 0 else "SYNCED",
                },
            }

            clusters_flagged = int(1 if r < 6 else (2 if r < 14 else 3))

            block = chain.append(
                r,
                {
                    "global_accuracy": base_acc,
                    "clusters_flagged": clusters_flagged,
                },
            )

            # 3. Update Live Telemetry
            STATE.round = r
            STATE.accuracy_delta = delta
            STATE.global_accuracy = base_acc
            STATE.accuracy_history.append(base_acc)
            STATE.institutions = inst_status
            STATE.clusters_flagged = clusters_flagged
            STATE.chain_integrity = {"verified_blocks": r, "total_blocks": n_rounds}
            
            STATE.hero_cluster = {
                "id": "CLUSTER_HERO_0X7A2",
                "wallet_count": 14,
                "local_score": local_hero,
                "local_label": "LOW-RISK",
                "global_score": global_hero,
                "global_label": "HIGH-RISK" if global_hero >= 0.50 else "AWAITING",
            }

            STATE.audit_log.insert(0, {
                "block": f"#{block.index:04d}",
                "round": block.round,
                "hash": block.hash[:16] + "…",
                "status": "VERIFIED",
            })

    except asyncio.CancelledError:
        pass
    finally:
        STATE.is_running = False


@app.post("/api/demo/start")
async def start_demo(n_rounds: int = 20, round_delay_seconds: float = 1.2):
    global _current_task
    
    # Cancel previous run if still active
    if _current_task and not _current_task.done():
        _current_task.cancel()

    STATE.reset()
    _current_task = asyncio.create_task(run_simulation_worker(n_rounds, round_delay_seconds))
    return {"started": True, "live": True}


@app.get("/api/status")
async def get_status():
    return {
        "global_accuracy": STATE.global_accuracy,
        "accuracy_delta": STATE.accuracy_delta,
        "institutions_online": STATE.institutions_online,
        "institutions_total": STATE.institutions_total,
        "clusters_flagged": STATE.clusters_flagged,
        "chain_integrity": STATE.chain_integrity,
        "round": STATE.round,
        "total_rounds": STATE.total_rounds,
        "live": STATE.is_running,
    }


@app.get("/api/accuracy-history")
async def get_accuracy_history():
    return {
        "rounds": list(range(1, len(STATE.accuracy_history) + 1)),
        "accuracy": STATE.accuracy_history,
    }


@app.get("/api/institutions")
async def get_institutions():
    return STATE.institutions


@app.get("/api/hero-cluster")
async def get_hero_cluster():
    return STATE.hero_cluster


@app.get("/api/audit-log")
async def get_audit_log(limit: int = 20):
    return STATE.audit_log[:limit]


@app.get("/")
async def root():
    return {"service": "FTIC backend", "status": "online"}
