import argparse
import numpy as np
import torch
torch.set_num_threads(1)

from flwr.compat.client.app import start_numpy_client
from flwr.compat.client.numpy_client import NumPyClient

from model import (
    RiskClassifier,
    get_weights,
    set_weights,
    train_one_epoch,
    predict_risk_scores,
    evaluate as eval_model,
)
from dp import clip_and_noise_update
from entity_resolution import cluster_wallets, local_cluster_risk_score
from synthetic_data import insti_Dataset, generate_hero_cluster_views, Hero_ClusterID

INSTITUTION_LABELS = {1: "EXCHANGE", 2: "FORENSIC FIRM", 3: "BANK", 4: "BANK/EXCHANGE"}


class InstitutionClient(NumPyClient):
    def __init__(self, node_id: int, dp_noise_multiplier: float = 0.05, n_samples: int = 5000):
        self.node_id = node_id
        self.dp_noise_multiplier = dp_noise_multiplier
        self.model = RiskClassifier()

        self.X, self.y, self.wallet_ids, self.cluster_map = insti_Dataset(
            node_id, n_institutions=4, n_samples=n_samples, include_hero=(node_id == 1)
        )
        self.local_clusters = cluster_wallets(self.X, self.wallet_ids)

        self.solo_model = RiskClassifier() if node_id == 1 else None
        if node_id == 1:
            self.hero_dampened, _, _ = generate_hero_cluster_views(n_total_samples=n_samples)

    def get_parameters(self, config):
        return get_weights(self.model)

    def fit(self, parameters, config):
        old_weights = [p.copy() for p in parameters]
        set_weights(self.model, parameters)
        loss = train_one_epoch(self.model, self.X, self.y)

        new_weights = get_weights(self.model)
        noised_weights = clip_and_noise_update(
            old_weights, new_weights, clip_norm=1.0, noise_multiplier=self.dp_noise_multiplier
        )

        metrics = {"train_loss": float(loss), "node_id": self.node_id}

        if self.node_id == 1:
            train_one_epoch(self.solo_model, self.X, self.y)
            local_hero_score = float(np.mean(predict_risk_scores(self.solo_model, self.hero_dampened)))
            metrics["local_hero_score"] = local_hero_score

        return noised_weights, len(self.X), metrics

    def evaluate(self, parameters, config):
        set_weights(self.model, parameters)
        loss, acc = eval_model(self.model, self.X, self.y)
        return loss, len(self.X), {"accuracy": acc, "node_id": self.node_id}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--node-id", type=int, required=True)
    parser.add_argument("--server-address", type=str, default="flower-server:8080")
    parser.add_argument("--dp-noise", type=float, default=0.05)
    parser.add_argument("--n-samples", type=int, default=5000)
    args = parser.parse_args()

    client = InstitutionClient(node_id=args.node_id, dp_noise_multiplier=args.dp_noise, n_samples=args.n_samples)
    print(f"[node {args.node_id}] connecting to {args.server_address} "
          f"as {INSTITUTION_LABELS.get(args.node_id, 'INSTITUTION')} "
          f"({len(client.X)} local wallets)")

    start_numpy_client(server_address=args.server_address, client=client)


if __name__ == "__main__":
    main()