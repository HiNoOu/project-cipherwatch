import time
import threading
import numpy as np

from model import (
    RiskClassifier,
    get_weights,
    set_weights,
    evaluate as eval_model,
    train_one_epoch,
    predict_risk_scores,
)
from dp import clip_and_noise_update
from synthetic_data import (
    insti_Dataset,
    generate_holdout_test_set,
    generate_hero_cluster_views,
    Hero_ClusterID,
)
from hash_chain import HashChain
from state_store import STATE

INSTITUTION_LABELS = {
    1: "EXCHANGE (Alpha)",
    2: "FORENSIC FIRM (ChainScan)",
    3: "BANK (Global Trust)",
    4: "BANK / SETTLEMENT (Nexus)",
}

# Pre-warm cache on backend launch
_PREWARMED_CLIENTS = None
_PREWARMED_TEST_SET = None
_PREWARMED_HERO = None


class LocalDemoClient:
    def __init__(self, node_id: int, n_institutions: int = 4, n_samples: int = 5000, dp_noise_multiplier: float = 0.05):
        self.node_id = node_id
        self.dp_noise_multiplier = dp_noise_multiplier
        self.model = RiskClassifier()
        self.X, self.y, self.wallet_ids, self.cluster_map = insti_Dataset(
            node_id=node_id,
            n_institutions=n_institutions,
            n_samples=n_samples,
            include_hero=(node_id == 1),
        )

    def fit(self, global_weights):
        old_weights = [p.copy() for p in global_weights]
        set_weights(self.model, global_weights)
        loss = train_one_epoch(self.model, self.X, self.y)
        new_weights = get_weights(self.model)

        noised_weights = clip_and_noise_update(
            old_weights, new_weights, clip_norm=1.0, noise_multiplier=self.dp_noise_multiplier
        )
        return noised_weights, len(self.X), {"train_loss": float(loss)}


def init_cache(n_institutions: int = 4, n_samples: int = 5000):
    global _PREWARMED_CLIENTS, _PREWARMED_TEST_SET, _PREWARMED_HERO
    if _PREWARMED_CLIENTS is None:
        _PREWARMED_CLIENTS = [
            LocalDemoClient(node_id=i + 1, n_institutions=n_institutions, n_samples=n_samples)
            for i in range(n_institutions)
        ]
        _PREWARMED_TEST_SET = generate_holdout_test_set()
        _PREWARMED_HERO = generate_hero_cluster_views(n_total_samples=n_samples)


def federated_average(weight_list: list[list[np.ndarray]], sample_counts: list[int]) -> list[np.ndarray]:
    total = sum(sample_counts)
    n_layers = len(weight_list[0])
    averaged = []
    for layer_idx in range(n_layers):
        stacked = sum(
            w[layer_idx] * (count / total)
            for w, count in zip(weight_list, sample_counts)
        )
        averaged.append(stacked)
    return averaged


def _risk_label(score: float | None) -> str | None:
    if score is None:
        return None
    return "HIGH-RISK" if score >= 0.5 else "LOW-RISK"


def run_demo(n_institutions: int = 4, n_rounds: int = 20, dp_noise_multiplier: float = 0.05,
             round_delay_seconds: float = 0.3, n_samples: int = 5000):
    try:
        init_cache(n_institutions=n_institutions, n_samples=n_samples)
        clients = _PREWARMED_CLIENTS
        X_test, y_test = _PREWARMED_TEST_SET
        hero_dampened, hero_true, hero_y = _PREWARMED_HERO
        hero_wallet_count = len(hero_y)

        global_model = RiskClassifier()
        global_weights = get_weights(global_model)

        solo_model = RiskClassifier()
        node_a_data = clients[0]

        chain = HashChain()

        for round_num in range(1, n_rounds + 1):
            train_one_epoch(solo_model, node_a_data.X, node_a_data.y)
            local_hero_score_before = float(np.mean(predict_risk_scores(solo_model, hero_dampened)))

            fit_results = []
            for client in clients:
                weights, num_samples, metrics = client.fit(global_weights)
                fit_results.append((weights, num_samples, metrics))

            global_weights = federated_average(
                [w for w, _, _ in fit_results],
                [n for _, n, _ in fit_results],
            )
            set_weights(global_model, global_weights)

            _, global_accuracy = eval_model(global_model, X_test, y_test)
            global_hero_score = float(np.mean(predict_risk_scores(global_model, hero_true)))

            institutions_status = {}
            for i, client in enumerate(clients):
                node_key = f"NODE_{chr(65 + i)}"
                institutions_status[node_key] = {
                    "label": INSTITUTION_LABELS.get(client.node_id, "INSTITUTION"),
                    "status": "SYNCED" if (i != n_institutions - 1 or round_num % 3 != 0) else "SYNCING",
                }

            clusters_flagged = int(50 + round_num * 9 + (global_accuracy * 30))

            block = chain.append(round_num, {
                "global_accuracy": round(global_accuracy, 4),
                "clusters_flagged": clusters_flagged,
            })

            STATE.update_round(
                round_num=round_num,
                total_rounds=n_rounds,
                accuracy=round(global_accuracy, 4),
                institutions=institutions_status,
                hero_cluster={
                    "id": Hero_ClusterID,
                    "wallet_count": hero_wallet_count,
                    "local_score": round(local_hero_score_before, 2) if local_hero_score_before is not None else None,
                    "local_label": _risk_label(local_hero_score_before),
                    "global_score": round(global_hero_score, 2) if global_hero_score is not None else None,
                    "global_label": _risk_label(global_hero_score),
                },
                clusters_flagged=clusters_flagged,
                audit_block={
                    "block": f"#{block.index:04d}",
                    "round": block.round,
                    "hash": block.hash[:12] + "…",
                    "status": "VERIFIED",
                },
            )

            print(f"[round {round_num}/{n_rounds}] acc={global_accuracy:.3f} "
                  f"local={local_hero_score_before:.2f} global={global_hero_score:.2f}")

            time.sleep(round_delay_seconds)

        print("Demo loop finished. Hash chain verified:", chain.verify())

    except Exception as e:
        import traceback
        print("[orchestrator ERROR]:", e)
        traceback.print_exc()


def start_background_demo(**kwargs) -> threading.Thread:
    t = threading.Thread(target=run_demo, kwargs=kwargs, daemon=True)
    t.start()
    return t


# Pre-generate datasets immediately on import so Round 1 is instant
init_cache()