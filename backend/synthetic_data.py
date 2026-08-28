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

N_RINGS_PER_NODE = 5

NODE_RISKY_FRACTION = {1: 0.22, 2: 0.14, 3: 0.16, 4: 0.20}
NODE_FEATURE_SHIFT = {
   
    1: np.array([0.05, 0.00, 0.00, 0.03, 0.10, 0.12, -0.03, 0.00]),
    2: np.array([0.00, 0.05, 0.03, 0.00, 0.02, 0.02, 0.00, 0.02]),
    3: np.array([-0.02, 0.00, 0.00, -0.02, 0.00, -0.03, 0.10, 0.06]),
    4: np.array([0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02]),
}


def wallet_features(label: int, visibility: float, rng=np.random.Generator, mean_shift: np.ndarray | None = None) -> np.ndarray:
    loc = 0.35 if label == 0 else 0.62
    base = rng.normal(loc=loc, scale=0.22, size=Feature_Numbers)
    if mean_shift is not None:
        base = base + mean_shift
    base = np.clip(base, 0, 1)
    dampened = base * visibility + 0.4 * (1 - visibility)
    return dampened.astype(np.float32)


def _ring_features(rng: np.random.Generator, n_rings: int, wallets_per_ring: list[int],
                    mean_shift: np.ndarray | None = None, within_ring_scale: float = 0.06) -> np.ndarray:
    rows = []
    for ring_idx in range(n_rings):
        center = rng.normal(loc=0.62, scale=0.20, size=Feature_Numbers)
        if mean_shift is not None:
            center = center + mean_shift
        n = wallets_per_ring[ring_idx]
        members = rng.normal(loc=center, scale=within_ring_scale, size=(n, Feature_Numbers))
        rows.append(members)
    X = np.clip(np.vstack(rows), 0, 1)
    return X.astype(np.float32)


def insti_Dataset(node_id: int, n_institutions: int = 4, n_samples: int = 5000, include_hero: bool = False):
    rng = np.random.default_rng(1305 + node_id)
    risky_fraction = NODE_RISKY_FRACTION.get(node_id, 0.18)
    mean_shift = NODE_FEATURE_SHIFT.get(node_id)

    n_risky = int(n_samples * risky_fraction)
    n_benign = n_samples - n_risky

    X = np.zeros((n_samples, Feature_Numbers), dtype=np.float32)
    y = np.zeros(n_samples, dtype=np.int64)
    wallet_ids = []
    cluster_map = {}

    for i in range(n_benign):
        X[i] = wallet_features(0, visibility=0.9, rng=rng)
        y[i] = 0
        wallet_ids.append(f"n{node_id}-benign-{i}")

    
    base_size = n_risky // N_RINGS_PER_NODE
    remainder = n_risky - base_size * N_RINGS_PER_NODE
    ring_sizes = [base_size + (1 if r < remainder else 0) for r in range(N_RINGS_PER_NODE)]

    risky_X = _ring_features(rng, N_RINGS_PER_NODE, ring_sizes, mean_shift=mean_shift)
    ring_idx = 0
    within_ring_pos = 0
    for j in range(n_risky):
        idx = n_benign + j
        y[idx] = 1
        wallet_id = f"n{node_id}-risky-{j}"
        wallet_ids.append(wallet_id)
        cluster_map[wallet_id] = f"cluster-{node_id}-{ring_idx}"
        X[idx] = risky_X[j]
        within_ring_pos += 1
        if within_ring_pos >= ring_sizes[ring_idx]:
            ring_idx += 1
            within_ring_pos = 0

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
