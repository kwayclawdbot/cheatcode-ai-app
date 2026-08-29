"""Pure functions over a BarView. No I/O, no network, no globals, no clock.

Every primitive takes a `BarView` — everything known as of the close of one bar
— and may read nothing else. See engine/series.py for why that is structural
rather than a convention.
"""
