"""What a model emits, what a fill costs, and what a finished trade records."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Side = Literal["long", "short"]
EntryType = Literal["market", "stop", "limit"]

# Exit reasons, in the order the engine checks them within a bar.
STOP = "stop"
TARGET = "target"
TIME = "time"
EXPIRED = "expired"       # never filled
INVALIDATED = "invalidated"


@dataclass(frozen=True)
class Costs:
    """Stated, not buried. Every report prints this block.

    commission_per_share  charged on entry AND exit (per-share, no minimum —
                          an IBKR-style tiered account)
    slippage_bps          adverse, applied to market and stop fills only. Limit
                          orders do not slip; instead they require the level to
                          be strictly penetrated before they are considered
                          filled, which is the pessimistic side of the same
                          uncertainty.
    """

    commission_per_share: float = 0.005
    slippage_bps: float = 1.0

    def slip(self, price: float, adverse_up: bool) -> float:
        d = price * self.slippage_bps / 10_000.0
        return price + d if adverse_up else price - d


@dataclass(frozen=True)
class Signal:
    """A decision taken at the close of `decision_idx`, acting from the next bar."""

    model_id: str
    symbol: str
    day: int
    decision_idx: int
    decision_minute: int
    side: Side
    entry_type: EntryType
    entry_price: float
    stop_price: float
    target_price: float
    expiry_minute: int          # cancel if unfilled at or after this ET minute
    exit_minute: int            # flatten at this ET minute if still open
    meta: dict = field(default_factory=dict)
    target_r: float | None = None
    """If set, the target is a multiple of the risk measured FROM THE FILL, and
    `target_price` is only the decision-time estimate of it.

    ENGINE-4's spec is "take profit at 2R". A decision is made at the close of
    one bar and filled at the open of the next, so the risk the position
    actually carries is not the risk the decision was priced on. Booking a
    target computed off the earlier price would quietly make a 2R model a
    1.5R-to-2.5R model, trade by trade, in a direction correlated with the gap.

    `None` means "the price in `target_price` is the target", which is every
    model written before ENGINE-4 and is unchanged by this field existing."""

    @property
    def risk_per_share(self) -> float:
        return abs(self.entry_price - self.stop_price)

    @property
    def reward_per_share(self) -> float:
        return abs(self.target_price - self.entry_price)


@dataclass
class Trade:
    model_id: str
    symbol: str
    day: int
    side: Side
    decision_minute: int
    entry_minute: int
    exit_minute: int
    signal_entry: float
    fill_price: float
    stop_price: float
    target_price: float
    exit_price: float
    exit_reason: str
    bars_held: int
    risk_per_share: float
    mae_price: float            # worst excursion against, in price, from fill
    mfe_price: float            # best excursion for, in price, from fill
    gross_r: float
    net_r: float
    gross_pct: float
    net_pct: float
    mae_r: float
    mfe_r: float
    ambiguous_bar: bool         # stop and target both inside one bar's range
    meta: dict = field(default_factory=dict)


@dataclass
class Rejection:
    """A signal that never became a trade. Counted so the report can say how
    many candidates the model produced versus how many it actually traded."""

    symbol: str
    day: int
    reason: str
