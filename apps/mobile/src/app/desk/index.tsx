/**
 * The research desk, reached from the Account board.
 *
 * The screen itself lives in `src/features/desk/Watchlist.tsx` because the
 * second tab draws the SAME thing in Invest mode. This route is the other door
 * — it works in every mode, and it is what a deep link to `/desk` lands on.
 */
import React from 'react';
import { DeskWatchlist } from '../../features/desk/Watchlist';

export default function DeskWatchlistRoute() {
  return <DeskWatchlist variant="stack" />;
}
