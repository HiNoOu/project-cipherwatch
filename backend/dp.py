import numpy as np

def clip_and_noise_update(old_weights: list[np.ndarray], new_weights: list[np.ndarray], clip_norm: float = 1.0, noise_multiplier: float = 0.05, rng: np.random.Generator | None = None) -> list[np.ndarray]:
    rng = np.random.default_rng()
    delta = [new - old for new,old in zip(new_weights,old_weights)]
    flatten = np.concatenate([d.flatten() for d in delta])

    total_norm = float(np.linalg.norm(flatten)) + 1e-12
    scale = min(1.0, clip_norm / total_norm)

    noisy_deltas = []
    for d in delta:
        clipped = d * scale
        noise = rng.normal(0.0, noise_multiplier * clip_norm, size=d.shape).astype(d.dtype)
        noisy_deltas.append(clipped + noise)

    return [old + nd for old, nd in zip(old_weights, noisy_deltas)]


    


    