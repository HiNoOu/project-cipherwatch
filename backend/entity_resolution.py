from __future__ import annotations
from typing import List, Dict, Optional, Callable
import numpy as np
from sklearn.cluster import DBSCAN


def _standardize(X: np.ndarray) -> np.ndarray:
    mean = X.mean(axis=0, keepdims=True)
    std = X.std(axis=0, keepdims=True) + 1e-8
    return (X - mean) / std


def cluster_wallets(
    X: np.ndarray,
    wallet_ids: List[str],
    eps: float = 0.9,
    min_samples: int = 3,
    risk_scores: Optional[np.ndarray] = None,
    risk_score_floor: float = 0.5,
) -> List[List[str]]:
    
    if risk_scores is not None:
        keep_idx = np.where(risk_scores >= risk_score_floor)[0]
    else:
        keep_idx = np.arange(len(wallet_ids))

    if len(keep_idx) == 0:
        return []

    Xs = _standardize(X[keep_idx])
    ids = [wallet_ids[i] for i in keep_idx]

    labels = DBSCAN(eps=eps, min_samples=min_samples).fit_predict(Xs)

    clusters: Dict[int, List[str]] = {}
    for wid, label in zip(ids, labels):
        if label == -1:
            continue  # noise / not part of any ring
        clusters.setdefault(label, []).append(wid)

    return list(clusters.values())


def local_cluster_risk_score(
    model_predict_fn: Callable,
    X: np.ndarray,
    wallet_ids: List[str],
    cluster: List[str],
) -> float:
    id_to_idx = {wid: i for i, wid in enumerate(wallet_ids)}
    idx = [id_to_idx[w] for w in cluster if w in id_to_idx]
    if not idx:
        return 0.0
    scores = model_predict_fn(X[idx])
    return float(np.mean(scores))


def evaluate_clustering(
    clusters: List[List[str]],
    wallet_ids: List[str],
    y: np.ndarray,
) -> dict:
    id_to_idx = {w: i for i, w in enumerate(wallet_ids)}
    total_risky = int(y.sum())

    majority_risky_clusters = 0
    risky_wallets_found = set()
    for cl in clusters:
        idxs = [id_to_idx[w] for w in cl if w in id_to_idx]
        if not idxs:
            continue
        risky_frac = float(np.mean(y[idxs]))
        if risky_frac >= 0.5:
            majority_risky_clusters += 1
        risky_wallets_found.update(w for w in cl if w in id_to_idx and y[id_to_idx[w]] == 1)

    precision = majority_risky_clusters / len(clusters) if clusters else 0.0
    recall = len(risky_wallets_found) / total_risky if total_risky else 0.0
    largest_cluster = max((len(c) for c in clusters), default=0)

    return {
        "n_clusters": len(clusters),
        "majority_risky_clusters": majority_risky_clusters,
        "cluster_precision": round(precision, 3),
        "wallet_recall": round(recall, 3),
        "largest_cluster_size": largest_cluster,
    }
