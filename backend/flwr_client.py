import numpy as np
from flwr.client import NumPyClient

from model import RiskClassifier, get_weights, set_weights, train_one_epoch, predict_risk_scores
from dp import clip_and_noise_update
from entity_resolution import cluster_wallets, local_cluster_risk_score
from synthetic_data import insti_Dataset, Hero_ClusterID

INSTITUTION_LABELS = {
    1: "EXCHANGE",
    2: "FORENSIC FIRM",
    3: "BANK",
    4: "BANK/EXCHANGE",
}

class InstitutionClient(NumPyClient):
    def __init__(self, node_id: int, n_institutions: int, dp_noise_multiplier: float = 0.05):
        self.node_id = node_id
        self.dp_noise_multiplier = dp_noise_multiplier
        self.model = RiskClassifier()

        self.X, self.y, self.wallet_ids, self.cluster_map = insti_Dataset(
            node_id, n_institutions, include_hero=(node_id == 1)
        )
        self.local_clusters = cluster_wallets(self.X, self.wallet_ids)

    def get_parameters(self, config):
        return get_weights(self.model)

    def fit(self, parameters, config):
        old_weights = [p.copy() for p in parameters]
        set_weights(self.model, parameters)

        losses = [train_one_epoch(self.model, self.X, self.y) for _ in range(3)]

        new_weights = get_weights(self.model)
        noised_weights = clip_and_noise_update(
            old_weights, new_weights, clip_norm=1.0, noise_multiplier=self.dp_noise_multiplier
        )

        metrics = {"train_loss": float(np.mean(losses)), "node_id": self.node_id}
        return noised_weights, len(self.X), metrics

    def evaluate(self, parameters, config):
        set_weights(self.model, parameters)
        from model import evaluate as eval_fn
        loss, acc = eval_fn(self.model, self.X, self.y)
        return loss, len(self.X), {"accuracy": acc, "node_id": self.node_id}

    def local_hero_cluster_score(self) -> float | None:
        hero_wallets = [w for w, c in self.cluster_map.items() if c == Hero_ClusterID]
        if not hero_wallets:
            return None
        predict_fn = lambda X: predict_risk_scores(self.model, X)
        return local_cluster_risk_score(predict_fn, self.X, self.wallet_ids, hero_wallets)

def make_client_fn(n_institutions: int, dp_noise_multiplier: float):
    def client_fn(cid: str):
        node_id = int(cid) + 1
        client = InstitutionClient(node_id, n_institutions, dp_noise_multiplier)
        return client.to_client()
    return client_fn

