from __future__ import annotations
from typing import List, Optional
import numpy as np


def clip_and_noise_update(
    old_weights: List[np.ndarray],
    new_weights: List[np.ndarray],
    clip_norm: float = 1.0,
    noise_multiplier: float = 0.05,
    rng: Optional[np.random.Generator] = None,
) -> List[np.ndarray]:
    rng = rng if rng is not None else np.random.default_rng()
    delta = [new - old for new, old in zip(new_weights, old_weights)]
    flatten = np.concatenate([d.flatten() for d in delta])

    total_norm = float(np.linalg.norm(flatten)) + 1e-12
    scale = min(1.0, clip_norm / total_norm)

    noisy_deltas = []
    for d in delta:
        clipped = d * scale
        noise = rng.normal(0.0, noise_multiplier * clip_norm, size=d.shape).astype(d.dtype)
        noisy_deltas.append(clipped + noise)

    return [old + nd for old, nd in zip(old_weights, noisy_deltas)]


def gaussian_mechanism_rho(noise_multiplier: float) -> float:
    return 1.0 / (2.0 * noise_multiplier ** 2)


def compose_rounds(noise_multiplier: float, n_rounds: int) -> float:
    return gaussian_mechanism_rho(noise_multiplier) * n_rounds


def rho_to_epsilon(rho: float, delta: float = 1e-5) -> float:
    return rho + 2.0 * np.sqrt(rho * np.log(1.0 / delta))


def epsilon_after_rounds(noise_multiplier: float, n_rounds: int, delta: float = 1e-5) -> float:
    rho = compose_rounds(noise_multiplier, n_rounds)
    return round(float(rho_to_epsilon(rho, delta)), 2)
