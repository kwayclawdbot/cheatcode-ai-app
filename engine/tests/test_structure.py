"""Hand-checked swings. The tape below is read off the page, not off the code.

idx :   0     1     2     3     4     5
high:  10    12    11    13     9    14
low :   8     9    10     9     7    10
close:  9    11  10.5  12.5     8  13.5

With left=1, right=1 a swing is confirmable only for 1 <= j <= n-2.

  j=1  highs [10,12,11] -> 12 is the unique max     -> SWING HIGH 12
       lows  [8,9,10]   -> min is 8 at j-1          -> no
  j=2  highs [12,11,13] -> max 13 is not h[2]       -> no
       lows  [9,10,9]   -> min 9 is not l[2]        -> no
  j=3  highs [11,13,9]  -> 13 unique max            -> SWING HIGH 13
       lows  [10,9,7]   -> min 7 at j+1             -> no
  j=4  highs [13,9,14]  -> no
       lows  [9,7,10]   -> 7 unique min             -> SWING LOW 7
"""

from engine.primitives.structure import structure_state, swing_points
from engine.tests.fixtures import make

BARS = [
    (570, 9.5, 10.0, 8.0, 9.0, 100.0),
    (571, 9.0, 12.0, 9.0, 11.0, 100.0),
    (572, 11.0, 11.0, 10.0, 10.5, 100.0),
    (573, 10.5, 13.0, 9.0, 12.5, 100.0),
    (574, 12.5, 9.0, 7.0, 8.0, 100.0),
    (575, 8.0, 14.0, 10.0, 13.5, 100.0),
]
TAPE = make(BARS)


def test_swings_confirmed_at_the_last_bar():
    got = [(s.idx, s.price, s.kind) for s in swing_points(TAPE.view(5), 1, 1)]
    assert got == [(1, 12.0, "high"), (3, 13.0, "high"), (4, 7.0, "low")]


def test_a_swing_is_invisible_until_the_bar_that_confirms_it_closes():
    """As of bar 4 the low at bar 4 is not yet a swing: bar 5 has not closed."""
    got = [(s.idx, s.price, s.kind) for s in swing_points(TAPE.view(4), 1, 1)]
    assert got == [(1, 12.0, "high"), (3, 13.0, "high")]
    assert [s.kind for s in swing_points(TAPE.view(2), 1, 1)] == ["high"]


def test_structure_state_walks_the_breaks():
    """bar 3 closes 12.5 above the swing high 12 -> bullish BOS.
    bar 5 closes 13.5 above the swing high 13    -> a second bullish BOS."""
    st = structure_state(TAPE.view(5), 1, 1)
    assert st.direction == "bull"
    assert st.last_break_idx == 5
    assert st.last_break_level == 13.0
    assert st.last_break_kind == "bos"
    assert st.swing_high == 13.0
    assert st.swing_low == 7.0


def test_choch_is_a_break_against_the_prevailing_direction():
    """Same tape plus a bar that closes below the swing low of 7."""
    tape = make(BARS + [(576, 13.5, 13.6, 6.0, 6.5, 100.0),
                        (577, 6.5, 7.0, 6.0, 6.2, 100.0)])
    st = structure_state(tape.view(7), 1, 1)
    assert st.direction == "bear"
    assert st.last_break_kind == "choch"
    assert st.last_break_level == 7.0
