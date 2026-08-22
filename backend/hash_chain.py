import hashlib
import json
import time
from dataclasses import dataclass, field


@dataclass
class Block:
    index: int
    round: int
    data: dict
    prev_hash: str
    timestamp: float = field(default_factory=time.time)
    hash: str = field(default="")

    def __post_init__(self):
        if not self.hash:
            self.hash = self.compute_hash()

    def compute_hash(self) -> str:
        payload = json.dumps(
            {
                "index": self.index,
                "round": self.round,
                "data": self.data,
                "prev_hash": self.prev_hash,
                "timestamp": self.timestamp,
            },
            sort_keys=True,
        ).encode("utf-8")
        return hashlib.sha256(payload).hexdigest()


class HashChain:
    def __init__(self):
        self.blocks: list[Block] = []

    def append(self, round_num: int, data: dict) -> Block:
        index = len(self.blocks)
        prev_hash = self.blocks[-1].hash if self.blocks else "0" * 64
        block = Block(
            index=index,
            round=round_num,
            data=data,
            prev_hash=prev_hash,
        )
        self.blocks.append(block)
        return block

    def verify(self) -> bool:
        for i, block in enumerate(self.blocks):
            if block.hash != block.compute_hash():
                return False
            if i > 0 and block.prev_hash != self.blocks[i - 1].hash:
                return False
            if i == 0 and block.prev_hash != "0" * 64:
                return False
        return True