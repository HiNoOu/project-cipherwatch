"""
FastAPI backend for the Federated Threat Intelligence Console dashboard.
"""

import asyncio
import random
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hash_chain import HashChain

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
            "id": "CLUSTER_HERO_0X7A2",
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


async def run_simulation_worker(n_rounds: int = 20, round_delay: float = 2.0):
    STATE.is_running = True
    chain = HashChain()
    current_acc = 0.528

    try:
        for r in range(1, n_rounds + 1):
            await asyncio.sleep(round_delay)

            # 1. Realistic Differential Privacy Accuracy with variance
            dp_noise = random.uniform(-0.012, 0.018) if r > 3 else random.uniform(0.015, 0.035)
            step_gain = (0.024 / (1.0 + r * 0.06)) + dp_noise
            new_acc = max(0.50, min(0.968, current_acc + step_gain))
            delta = round(new_acc - current_acc, 4)
            current_acc = round(new_acc, 4)

            # 2. Clusters Flagged in the 100s–200s range
            clusters_flagged = int(54 + (r * 9) + int(current_acc * 32) + random.randint(-2, 3))

            # 3. Hero Cluster Progressive Global Discovery
            local_hero = 0.40
            if r < 4:
                global_hero = round(0.38 + random.uniform(-0.03, 0.04), 2)
            else:
                target_score = min(0.96, 0.42 + ((r - 3) * 0.038) + random.uniform(-0.02, 0.02))
                global_hero = round(target_score, 2)

            # 4. Node D blinks SYNCING every 3 rounds
            inst_status = {
                "NODE_A": {"label": "EXCHANGE (Alpha)", "status": "SYNCED"},
                "NODE_B": {"label": "FORENSIC FIRM (ChainScan)", "status": "SYNCED"},
                "NODE_C": {"label": "BANK (Global Trust)", "status": "SYNCED"},
                "NODE_D": {
                    "label": "BANK / SETTLEMENT (Nexus)",
                    "status": "SYNCING" if r % 3 == 0 else "SYNCED",
                },
            }

            block = chain.append(
                r,
                {
                    "global_accuracy": current_acc,
                    "clusters_flagged": clusters_flagged,
                },
            )

            # 5. Push telemetry
            STATE.round = r
            STATE.accuracy_delta = delta
            STATE.global_accuracy = current_acc
            STATE.accuracy_history.append(current_acc)
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

            STATE.audit_log.insert(
                0,
                {
                    "block": f"#{block.index:04d}",
                    "round": block.round,
                    "hash": block.hash[:16] + "…",
                    "status": "VERIFIED",
                },
            )

    except asyncio.CancelledError:
        pass
    finally:
        STATE.is_running = False


@app.post("/api/demo/start")
async def start_demo(n_rounds: int = 20, round_delay_seconds: float = 2.0):
    global _current_task

    if _current_task and not _current_task.done():
        _current_task.cancel()

    STATE.reset()
    _current_task = asyncio.create_task(
        run_simulation_worker(n_rounds=n_rounds, round_delay=round_delay_seconds)
    )
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
