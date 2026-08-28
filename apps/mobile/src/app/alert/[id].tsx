import React, { useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { ScreenLoading } from '../../ui/Loading';
import { api } from '../../lib/api';
import { fixtureAlertsRound4 } from '../../lib/fixtures';

/**
 * `/alert/[id]` — NO generic alert-detail destination exists any more
 * (docs/10 §1 and §6: "No generic alert-detail destination sits between the
 * card and Trade Portal"). This route only survives so old links, push
 * notifications and SMS deep links keep working: it resolves the alert's
 * symbol and redirects into the Trade Portal carrying alert context.
 *
 * It resolves to a `<Redirect>` rather than calling `router.replace` in an
 * effect — landing on this URL directly can run the effect before the root
 * layout has mounted a navigator.
 */
export default function AlertRedirect() {
  const { id, symbol } = useLocalSearchParams<{ id: string; symbol?: string }>();
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const portal = (sym: string) =>
      `/trade/${encodeURIComponent(sym)}?alert=${encodeURIComponent(id ?? '')}&ctx=alert`;

    if (symbol) { setHref(portal(symbol)); return; }
    if (!id) { setHref('/alerts'); return; }

    (async () => {
      try {
        const cards = api.available() ? await api.alertsRound4() : fixtureAlertsRound4;
        const found = [...cards.active, ...cards.watching, ...cards.history].find((a) => a.id === id);
        if (alive && found) { setHref(portal(found.symbol)); return; }
      } catch {
        /* fall through to the list */
      }
      if (alive) setHref('/alerts');
    })();
    return () => { alive = false; };
  }, [id, symbol]);

  if (href) return <Redirect href={href as never} />;
  return (
    <Screen variant="corner" layout="stack" testID="screen-alert-redirect">
      <ScreenLoading label="Opening the chart…" />
    </Screen>
  );
}
