import networkx as nx
import numpy as np


def cluster_wallets(
    X: np.ndarray,
    wallet_ids: list[str],
    similarity_threshold: float = 0.85,
    max_wallets: int = 1500,
) -> list[list[str]]:
    n = len(wallet_ids)
    if n == 0:
        return []

    norms = np.linalg.norm(X, axis=1, keepdims=True) + 1e-8
    Xn = X / norms

    if n <= max_wallets:
        sims = Xn @ Xn.T
        np.fill_diagonal(sims, 0)
        adj = sims >= similarity_threshold
        G = nx.from_numpy_array(adj)
        G = nx.relabel_nodes(G, {i: wid for i, wid in enumerate(wallet_ids)})
    else:
        G = nx.Graph()
        G.add_nodes_from(wallet_ids)
        chunk = 500
        for start in range(0, n, chunk):
            end = min(start + chunk, n)
            sims_chunk = Xn[start:end] @ Xn.T
            rows, cols = np.where(sims_chunk >= similarity_threshold)
            for r, c in zip(rows, cols):
                gi, gj = start + r, c
                if gi < gj:
                    G.add_edge(wallet_ids[gi], wallet_ids[gj])

    clusters = [list(c) for c in nx.connected_components(G) if len(c) > 1]
    return clusters


def local_cluster_risk_score(
    model_predict_fn,
    X: np.ndarray,
    wallet_ids: list[str],
    cluster: list[str],
) -> float:
    id_to_idx = {wid: i for i, wid in enumerate(wallet_ids)}
    idx = [id_to_idx[w] for w in cluster if w in id_to_idx]
    if not idx:
        return 0.0
    scores = model_predict_fn(X[idx])
    return float(np.mean(scores))