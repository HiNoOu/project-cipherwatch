import threading


class DemoState:


    def __init__(self):
        self._lock = threading.Lock()
        self.total_rounds = 20
        self.current_round = 0
        self.accuracy_history: list[float] = []
        self.institutions: dict[str, dict] = {}
        self.hero_cluster = {
            "id": "0x7a2...f1",
            "wallet_count": 14,
            "local_score": None,
            "local_label": None,
            "global_score": None,
            "global_label": None,
        }
        self.audit_log: list[dict] = []
        self.clusters_flagged = 0

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "round": self.current_round,
                "total_rounds": self.total_rounds,
                "global_accuracy": self.accuracy_history[-1] if self.accuracy_history else None,
                "accuracy_delta": (
                    round(self.accuracy_history[-1] - self.accuracy_history[-2], 4)
                    if len(self.accuracy_history) > 1 else 0.0
                ),
                "institutions": self.institutions,
                "institutions_online": sum(1 for i in self.institutions.values() if i["status"] != "OFFLINE"),
                "institutions_total": len(self.institutions),
                "clusters_flagged": self.clusters_flagged,
                "chain_integrity": {"verified_blocks": len(self.audit_log), "total_blocks": len(self.audit_log)},
                "hero_cluster": self.hero_cluster,
            }

    def update_round(self, round_num: int, total_rounds: int, accuracy: float,
                      institutions: dict, hero_cluster: dict, clusters_flagged: int,
                      audit_block: dict):
        with self._lock:
            self.current_round = round_num
            self.total_rounds = total_rounds
            self.accuracy_history.append(accuracy)
            self.institutions = institutions
            self.hero_cluster = hero_cluster
            self.clusters_flagged = clusters_flagged
            self.audit_log.append(audit_block)


STATE = DemoState()
