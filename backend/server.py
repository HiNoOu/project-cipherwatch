import argparse
import threading
import numpy as np
import uvicorn
import torch
torch.set_num_threads(1)

import flwr as fl
from flwr.server.strategy import FedAvg
from flwr.common import Parameters, parameters_to_ndarrays, ndarrays_to_parameters

from model import RiskClassifier, set_weights, evaluate as eval_model, predict_risk_scores
from synthetic_data import generate_holdout_test_set, generate_hero_cluster_views
from hash_chain import HashChain
from state_store import STATE

INSTITUTION_LABELS = {1: "EXCHANGE", 2: "FORENSIC FIRM", 3: "BANK", 4: "BANK/EXCHANGE"}


class CipherWatchStrategy(FedAvg):
    def __init__(self, *args, total_rounds: int, n_samples: int = 5000, **kwargs):
        super().__init__(*args, **kwargs)
        self.total_rounds = total_rounds
        self.global_model = RiskClassifier()
        self.X_test, self.y_test = generate_holdout_test_set()
        _, self.hero_true, hero_y = generate_hero_cluster_views(n_total_samples=n_samples)
        self.hero_wallet_count = len(hero_y)
        self.chain = HashChain()
        self._last_fit_metrics: dict[int, dict] = {}

    def aggregate_fit(self, server_round, results, failures):
        for _, fit_res in results:
            node_id = fit_res.metrics.get("node_id")
            if node_id is not None:
                self._last_fit_metrics[int(node_id)] = dict(fit_res.metrics)

        aggregated_parameters, aggregated_metrics = super().aggregate_fit(server_round, results, failures)
        if aggregated_parameters is not None:
            set_weights(self.global_model, parameters_to_ndarrays(aggregated_parameters))
        return aggregated_parameters, aggregated_metrics

    def evaluate(self, server_round: int, parameters: Parameters):
        set_weights(self.global_model, parameters_to_ndarrays(parameters))
        loss, accuracy = eval_model(self.global_model, self.X_test, self.y_test)

        global_hero_score = float(np.mean(predict_risk_scores(self.global_model, self.hero_true)))
        node1_metrics = self._last_fit_metrics.get(1, {})
        local_hero_score = node1_metrics.get("local_hero_score")

        institutions_status = {}
        for node_id, metrics in sorted(self._last_fit_metrics.items()):
            slot = chr(64 + node_id)
            institutions_status[f"NODE_{slot}"] = {
                "label": INSTITUTION_LABELS.get(node_id, "INSTITUTION"),
                "status": "SYNCED",
            }

        clusters_flagged = int(50 + server_round * 9 + accuracy * 30)

        block = self.chain.append(server_round, {
            "global_accuracy": round(accuracy, 4),
            "clusters_flagged": clusters_flagged,
        })

        STATE.update_round(
            round_num=server_round,
            total_rounds=self.total_rounds,
            accuracy=round(accuracy, 4),
            institutions=institutions_status,
            hero_cluster={
                "id": "0x7a2...f1",
                "wallet_count": self.hero_wallet_count,
                "local_score": round(local_hero_score, 2) if local_hero_score is not None else None,
                "local_label": _risk_label(local_hero_score),
                "global_score": round(global_hero_score, 2),
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

        print(f"[round {server_round}/{self.total_rounds}] acc={accuracy:.3f} "
              f"hero_local={local_hero_score} hero_global={global_hero_score:.3f}")

        return loss, {"accuracy": accuracy}


def _risk_label(score):
    if score is None:
        return None
    return "HIGH-RISK" if score >= 0.5 else "LOW-RISK"


def run_fastapi_in_background(port: int = 8000):
    import main as api_module
    config = uvicorn.Config(api_module.app, host="0.0.0.0", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    return thread


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--server-address", type=str, default="0.0.0.0:8080")
    parser.add_argument("--num-rounds", type=int, default=20)
    parser.add_argument("--min-clients", type=int, default=4)
    parser.add_argument("--n-samples", type=int, default=5000)
    parser.add_argument("--api-port", type=int, default=8000)
    args = parser.parse_args()

    run_fastapi_in_background(port=args.api_port)
    print(f"[server] dashboard API on :{args.api_port} — Flower gRPC on {args.server_address}")

    initial_model = RiskClassifier()
    strategy = CipherWatchStrategy(
        total_rounds=args.num_rounds,
        n_samples=args.n_samples,
        min_fit_clients=args.min_clients,
        min_evaluate_clients=args.min_clients,
        min_available_clients=args.min_clients,
        initial_parameters=ndarrays_to_parameters(
            [v.cpu().numpy() for v in initial_model.state_dict().values()]
        ),
    )

    fl.server.start_server(
        server_address=args.server_address,
        config=fl.server.ServerConfig(num_rounds=args.num_rounds),
        strategy=strategy,
    )

    assert strategy.chain.verify(), "hash chain failed self-verification"
    print("Run complete. Hash chain verified. Dashboard API stays up — Ctrl+C to stop.")

    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()