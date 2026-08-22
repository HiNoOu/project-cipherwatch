import threading
from collections import deque


class StateStore:
    def __init__(self):
        self._lock = threading.Lock()
        self.reset()

    def reset(self):
        with self._lock:
            self.round = 0
            self.total_rounds = 20
            self.global_accuracy = None
            self.accuracy_delta = 0.0
            self.institutions_online = 4
            self.institutions_total = 4
            self.clusters_flagged = 0
            self.chain_integrity = {"verified_blocks": 0, "total_blocks": 20}
            self.institutions = {
                "NODE_A": {"label": "EXCHANGE (Alpha)", "status": "SYNCED"},
                "NODE_B": {"label": "FORENSIC FIRM (ChainScan)", "status": "SYNCED"},
                "NODE_C": {"label": "BANK (Global Trust)", "status": "SYNCED"},
                "NODE_D": {"label": "BANK / SETTLEMENT (Nexus)", "status": "SYNCED"},
            }
            self.hero_cluster = {
                "id": "CLUSTER_HERO_0X7A2",
                "wallet_count": 14,
                "local_score": 0.40,
                "local_label": "LOW-RISK",
                "global_score": 0.00,
                "global_label": "AWAITING",
            }
            self.accuracy_history = []
            self.audit_log = deque(maxlen=50)

    def update_round(
        self,
        round_num: int,
        total_rounds: int,
        accuracy: float,
        institutions: dict,
        hero_cluster: dict,
        clusters_flagged: int,
        audit_block: dict,
        institutions_online: int = 4,
        institutions_total: int = 4,
        chain_integrity: dict = None,
    ):
        with self._lock:
            prior_acc = self.global_accuracy or accuracy
            self.round = round_num
            self.total_rounds = total_rounds
            self.accuracy_delta = round(accuracy - prior_acc, 4)
            self.global_accuracy = accuracy
            self.accuracy_history.append(accuracy)
            self.institutions = institutions
            self.institutions_online = institutions_online
            self.institutions_total = institutions_total
            self.hero_cluster = hero_cluster
            self.clusters_flagged = clusters_flagged
            self.audit_log.append(audit_block)
            if chain_integrity:
                self.chain_integrity = chain_integrity
            else:
                self.chain_integrity = {
                    "verified_blocks": round_num,
                    "total_blocks": total_rounds,
                }

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "round": self.round,
                "total_rounds": self.total_rounds,
                "global_accuracy": self.global_accuracy,
                "accuracy_delta": self.accuracy_delta,
                "institutions_online": self.institutions_online,
                "institutions_total": self.institutions_total,
                "clusters_flagged": self.clusters_flagged,
                "chain_integrity": dict(self.chain_integrity),
                "institutions": dict(self.institutions),
                "hero_cluster": dict(self.hero_cluster),
            }


STATE = StateStore()
