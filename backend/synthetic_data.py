import numpy as np

RN_Gen = np.random.default_rng(1305)

Feature_Numbers = 8
Features_Names = [
    "tx_count",
    "avg_amount",
    "amount_std",
    "unique_counterparties",
    "burst_score",
    "mixer_hop_score",
    "night_activity_ratio",
    "new_wallet_ratio",
]

Hero_ClusterID = "0x1A3...g4"


def wallet_features(label: int, visibility: float, rng=np.random.Generator) -> np.ndarray:
    base = rng.normal(loc=0.35 if label == 0 else 0.62, scale=0.22, size=Feature_Numbers)
    base = np.clip(base, 0, 1)
    dampened = base * visibility + 0.4 * (1 - visibility)
    return dampened.astype(np.float32)


def insti_Dataset(node_id: int, n_institutions: int = 4, n_samples: int = 5000, include_hero: bool = False):
    rng = np.random.default_rng(1305 + node_id)
    n_risky = int(n_samples * 0.18)
    n_benign = n_samples - n_risky

    X = np.zeros((n_samples, Feature_Numbers), dtype=np.float32)
    y = np.zeros(n_samples, dtype=np.int64)
    wallet_ids = []
    cluster_map = {}

    for i in range(n_benign):
        X[i] = wallet_features(0, visibility=0.9, rng=rng)
        y[i] = 0
        wallet_ids.append(f"n{node_id}-benign-{i}")

    for j in range(n_risky):
        idx = n_benign + j
        y[idx] = 1
        wallet_id = f"n{node_id}-risky-{j}"
        wallet_ids.append(wallet_id)
        cluster_map[wallet_id] = f"cluster-{node_id}-{j % 5}"
        X[idx] = wallet_features(1, visibility=0.9, rng=rng)

    if include_hero:
        hero_dampened, _, hero_y = generate_hero_cluster_views(n_total_samples=n_samples)
        hero_ids = [f"hero-{k}" for k in range(len(hero_y))]
        for wid in hero_ids:
            cluster_map[wid] = Hero_ClusterID
        X = np.vstack([X, hero_dampened])
        y = np.concatenate([y, hero_y])
        wallet_ids.extend(hero_ids)

    return X, y, wallet_ids, cluster_map


def generate_hero_cluster_views(
    n_wallets: int | None = None,
    n_total_samples: int = 5000,
    hero_fraction: float = 0.003,
    dampened_visibility: float = 0.0,
    true_visibility: float = 0.95,
):
    if n_wallets is None:
        n_wallets = max(14, int(n_total_samples * hero_fraction))
    rng = np.random.default_rng(7)
    base = np.clip(rng.normal(loc=0.62, scale=0.15, size=(n_wallets, Feature_Numbers)), 0, 1)
    dampened = base * dampened_visibility + 0.4 * (1 - dampened_visibility)
    true_view = base * true_visibility + 0.4 * (1 - true_visibility)
    y = np.ones(n_wallets, dtype=np.int64)
    return dampened.astype(np.float32), true_view.astype(np.float32), y


def generate_holdout_test_set(n_samples: int = 3000):
    rng = np.random.default_rng(999)
    n_risky = int(n_samples * 0.3)
    n_benign = n_samples - n_risky
    X = np.vstack([
        np.stack([wallet_features(0, 0.95, rng) for _ in range(n_benign)]),
        np.stack([wallet_features(1, 0.95, rng) for _ in range(n_risky)]),
    ]).astype(np.float32)
    y = np.concatenate([np.zeros(n_benign), np.ones(n_risky)]).astype(np.int64)
    return X, y