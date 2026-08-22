import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader
import numpy as np
from collections import OrderedDict


class ResidualBlock(nn.Module):
    def __init__(self, dim: int, dropout: float = 0.2):
        super().__init__()
        self.block = nn.Sequential(
            nn.Linear(dim, dim),
            nn.LayerNorm(dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(dim, dim),
            nn.LayerNorm(dim),
        )
        self.relu = nn.ReLU()

    def forward(self, x):
        return self.relu(x + self.block(x))


class RiskClassifier(nn.Module):

    def __init__(self, n_features: int = 8, hidden_dim: int = 64, n_blocks: int = 3, dropout: float = 0.2):
        super().__init__()
        self.stem = nn.Sequential(
            nn.Linear(n_features, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.ReLU(),
        )
        self.blocks = nn.Sequential(*[ResidualBlock(hidden_dim, dropout) for _ in range(n_blocks)])
        self.head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 2),
        )

    def forward(self, x):
        x = self.stem(x)
        x = self.blocks(x)
        return self.head(x)


def get_weights(model: nn.Module) -> list[np.ndarray]:
    return [v.cpu().numpy() for v in model.state_dict().values()]


def set_weights(model: nn.Module, weights: list[np.ndarray]) -> None:
    params = zip(model.state_dict().keys(), weights)
    state_dict = OrderedDict({k: torch.tensor(v) for k, v in params})
    model.load_state_dict(state_dict, strict=True)


def train_one_epoch(model: nn.Module, X: np.ndarray, y: np.ndarray, lr: float = 0.001, epochs: int = 3, batch_size: int = 128):
    model.train()
    opt = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    class_weights = torch.tensor([1.0, 4.5])
    loss_fn = nn.CrossEntropyLoss(weight=class_weights)

    ds = TensorDataset(torch.tensor(X, dtype=torch.float32), torch.tensor(y, dtype=torch.long))
    loader = DataLoader(ds, batch_size=batch_size, shuffle=True)

    last_loss = None
    for _ in range(epochs):
        for xb, yb in loader:
            opt.zero_grad()
            out = model(xb)
            loss = loss_fn(out, yb)
            loss.backward()
            opt.step()
            last_loss = float(loss.item())
    return last_loss


@torch.no_grad()
def evaluate(model: nn.Module, X: np.ndarray, y: np.ndarray, batch_size: int = 512):
    model.eval()
    xb = torch.tensor(X, dtype=torch.float32)
    yb = torch.tensor(y, dtype=torch.long)
    correct, total, loss_sum = 0, 0, 0.0
    loss_fn = nn.CrossEntropyLoss(reduction="sum")
    for i in range(0, len(xb), batch_size):
        out = model(xb[i:i + batch_size])
        yb_batch = yb[i:i + batch_size]
        preds = out.argmax(dim=1)
        correct += int((preds == yb_batch).sum().item())
        total += len(yb_batch)
        loss_sum += float(loss_fn(out, yb_batch).item())
    return loss_sum / total, correct / total


@torch.no_grad()
def predict_risk_scores(model: nn.Module, X: np.ndarray) -> np.ndarray:
    model.eval()
    xb = torch.tensor(X, dtype=torch.float32)
    probs = torch.softmax(model(xb), dim=1)[:, 1]
    return probs.numpy()
