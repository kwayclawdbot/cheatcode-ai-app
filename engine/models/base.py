"""A model is a declarative spec, not a score.

    preconditions  what must already be true
    trigger        the event that arms it, with the bar it occurred on
    levels         entry, invalidation, target — from structure, never a percent
    invalidation   the condition that kills it
    horizon        when it expires unfilled, and when it is flattened

The id carries a version. Changing a rule makes a new version; it does not
silently rewrite the history of the old one.
"""

from __future__ import annotations

from engine.backtest.types import Signal
from engine.series import BarView


class Model:
    id: str = "abstract.v0"
    description: str = ""

    def wants_bar(self, minute: int, day: int) -> bool:
        raise NotImplementedError

    def evaluate(self, view: BarView, day: int) -> Signal | None:
        raise NotImplementedError

    def params(self) -> dict:
        return {}
