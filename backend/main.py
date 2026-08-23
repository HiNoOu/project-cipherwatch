import asyncio
import logging
import threading
import time
from typing import Optional
import numpy as np
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from hash_chain import HashChain
from model import RiskClassifier, get_weights, set_weights, train_one_epoch, evaluate, predict_risk_scores
from synthetic_data import insti_Dataset, generate_holdout_test_set, generate_hero_cluster_views, Hero_ClusterID
from entity_resolution import cluster_wallets, evaluate_clustering
from dp import clip_and_noise_update, epsilon_after_rounds

logger = logging.getLogger("uvicorn.error")

INSTITUTION_LABELS = {
    1: "EXCHANGE (Alpha)",
    2: "FORENSIC FIRM (ChainScan)",
    3: "BANK (Global Trust)",
    4: "BANK / SETTLEMENT (Nexus)",
}
N_INSTITUTIONS = 4
N_SAMPLES = 2000
DP_NOISE_MULTIPLIER = 0.05

class DashboardState:
    def __init__(self):
        self.reset()

    def reset(self):
        self.round = 0
        self.total_rounds = 20
        self.global_accuracy = None
        self.accuracy_delta = 0.0
        self.institutions_online = N_INSTITUTIONS
        self.institutions_total = N_INSTITUTIONS
        self.clusters_flagged = 0
        self.privacy_epsilon = None
        self.chain_integrity = {"verified_blocks": 0, "total_blocks": 20}
        self.institutions = {
            f"NODE_{chr(65+i)}": {"label": INSTITUTION_LABELS[i + 1], "status": "SYNCED"}
            for i in range(N_INSTITUTIONS)
        }
        self.hero_cluster = {
            "id": Hero_ClusterID,
            "wallet_count": 0,
            "local_score": None,
            "local_label": "AWAITING",
            "global_score": None,
            "global_label": "AWAITING",
        }
        self.accuracy_history = []
        self.audit_log = []
        self.is_running = False


STATE = DashboardState()
_clients_data = None
_X_test = None
_y_test = None
_hero_dampened = None
_hero_true = None
_hero_y = None
_worker_thread = None
_lock = threading.Lock()


def _init_data():
    global _clients_data, _X_test, _y_test, _hero_dampened, _hero_true, _hero_y
    if _clients_data is None:
        print("--> Generating synthetic dataset in worker thread...")
        _clients_data = [
            insti_Dataset(node_id=i + 1, n_institutions=N_INSTITUTIONS, n_samples=N_SAMPLES,
                          include_hero=(i == 0))
            for i in range(N_INSTITUTIONS)
        ]
        _X_test, _y_test = generate_holdout_test_set()
        _hero_dampened, _hero_true, _hero_y = generate_hero_cluster_views(n_total_samples=N_SAMPLES)
        print("--> Synthetic dataset generation complete!")


def _risk_label(score):
    if score is None:
        return "AWAITING"
    return "HIGH-RISK" if score >= 0.5 else "LOW-RISK"


def _simulation_thread_target(n_rounds: int, round_delay: float):
    print(f"--> Starting simulation run for {n_rounds} rounds...")
    STATE.is_running = True
    try:
        _init_data()
        chain = HashChain()
        global_model = RiskClassifier()
        global_weights = get_weights(global_model)
        solo_model = RiskClassifier()

        for r in range(1, n_rounds + 1):
            if not STATE.is_running:
                break

            print(f"--> Executing Round {r}/{n_rounds}")
            fit_results = []
            for X, y, wallet_ids, cluster_map in _clients_data:
                m = RiskClassifier()
                set_weights(m, global_weights)
                train_one_epoch(m, X, y)
                noised = clip_and_noise_update(
                    global_weights, get_weights(m),
                    clip_norm=1.0, noise_multiplier=DP_NOISE_MULTIPLIER,
                )
                fit_results.append((noised, len(X)))

            total = sum(n for _, n in fit_results)
            n_layers = len(fit_results[0][0])
            averaged = [
                sum(w[i] * (n / total) for w, n in fit_results)
                for i in range(n_layers)
            ]
            global_weights = averaged
            set_weights(global_model, global_weights)

            train_one_epoch(solo_model, _clients_data[0][0], _clients_data[0][1])

            _, acc = evaluate(global_model, _X_test, _y_test)
            local_hero = float(np.mean(predict_risk_scores(solo_model, _hero_dampened))) if _hero_dampened is not None else None
            global_hero = float(np.mean(predict_risk_scores(global_model, _hero_true))) if _hero_true is not None else None

            risk_scores = predict_risk_scores(global_model, _clients_data[0][0])
            clusters = cluster_wallets(
                _clients_data[0][0], _clients_data[0][2],
                eps=0.9, min_samples=3,
                risk_scores=risk_scores, risk_score_floor=0.5,
            )

            prev_acc = STATE.global_accuracy if STATE.global_accuracy is not None else acc
            delta = round(acc - prev_acc, 4)

            inst_status = {
                f"NODE_{chr(65+i)}": {
                    "label": INSTITUTION_LABELS[i + 1],
                    "status": "SYNCING" if (i == 3 and r % 3 == 0) else "SYNCED",
                }
                for i in range(N_INSTITUTIONS)
            }

            epsilon = epsilon_after_rounds(DP_NOISE_MULTIPLIER, r)
            block = chain.append(r, {"global_accuracy": round(acc, 4), "clusters_flagged": len(clusters)})

            STATE.round = r
            STATE.accuracy_delta = delta
            STATE.global_accuracy = round(acc, 4)
            STATE.accuracy_history.append(STATE.global_accuracy)
            STATE.institutions = inst_status
            STATE.clusters_flagged = len(clusters)
            STATE.privacy_epsilon = epsilon
            STATE.chain_integrity = {"verified_blocks": r, "total_blocks": n_rounds}
            STATE.hero_cluster = {
                "id": Hero_ClusterID,
                "wallet_count": len(_hero_y) if _hero_y is not None else 0,
                "local_score": round(local_hero, 2) if local_hero is not None else None,
                "local_label": _risk_label(local_hero),
                "global_score": round(global_hero, 2) if global_hero is not None else None,
                "global_label": _risk_label(global_hero),
            }
            STATE.audit_log.insert(0, {
                "block": f"#{block.index:04d}", "round": block.round,
                "hash": block.hash[:16] + "...", "status": "VERIFIED",
            })

            time.sleep(round_delay)

    except Exception as e:
        logger.exception(f"Simulation crashed with error: {e}")
    finally:
        STATE.is_running = False
        print("--> Simulation run complete.")


def _launch_worker(n_rounds=20, round_delay=2.0):
    global _worker_thread
    with _lock:
        if _worker_thread is not None and _worker_thread.is_alive():
            return False
        STATE.reset()
        _worker_thread = threading.Thread(
            target=_simulation_thread_target,
            args=(n_rounds, round_delay),
            daemon=True,
        )
        _worker_thread.start()
        return True


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    # Automatically start worker thread on initial boot
    _launch_worker(n_rounds=20, round_delay=2.0)


@app.api_route("/api/demo/start", methods=["GET", "POST", "OPTIONS"])
async def start_demo(request: Request):
    n_rounds = 20
    round_delay = 2.0
    if request.method == "POST":
        try:
            body = await request.json()
            if isinstance(body, dict):
                n_rounds = int(body.get("n_rounds", 20))
                round_delay = float(body.get("round_delay_seconds", 2.0))
        except Exception:
            pass
    _launch_worker(n_rounds, round_delay)
    return {"started": True, "live": True}


@app.get("/api/status")
async def get_status():
    if not STATE.is_running and STATE.round == 0:
        _launch_worker(20, 2.0)

    return {
        "global_accuracy": STATE.global_accuracy,
        "accuracy_delta": STATE.accuracy_delta,
        "institutions_online": STATE.institutions_online,
        "institutions_total": STATE.institutions_total,
        "clusters_flagged": STATE.clusters_flagged,
        "privacy_epsilon": STATE.privacy_epsilon,
        "chain_integrity": STATE.chain_integrity,
        "round": STATE.round,
        "total_rounds": STATE.total_rounds,
        "live": STATE.is_running,
    }


@app.get("/api/accuracy-history")
async def get_accuracy_history():
    return {"rounds": list(range(1, len(STATE.accuracy_history) + 1)), "accuracy": STATE.accuracy_history}


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
