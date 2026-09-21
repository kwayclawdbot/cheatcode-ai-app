/**
 * A POST IN THE FEED (V2 board, panel 3).
 *
 *   avatar · display name (belt-dyed, a door to the profile) · @handle · time · …
 *   words, with $cashtags that open the symbol
 *   pictures · a chart drawn from live bars · the structured call · the result
 *   reply (count + who is talking) · repost · like · bookmark
 *
 * NO FOLLOW BUTTON HERE (owner, 21 Sept): following lives on the profile, which
 * the name and the picture both open. A feed of posts each asking to be
 * followed reads as a network selling itself, not a club talking.
 *
 * Every number is the server's. A toggle moves the count the moment it is
 * tapped and then takes the server's `{on, count}` as the truth.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { CommunityPost } from '@shared/community';
import type { MessageMedia, SocialAuthor } from '@cheatcode/shared';
import { T } from '../../../ui/Text';
import { alpha, color, layout } from '../../../ui/tokens';
import { Avatar } from '../ui/Chrome';
import { MediaStrip } from '../ui/Social';
import { MemberName } from '../../social/MemberName';
import { useTextScale } from '../../a11y/context';
import { CallObject, PostChart, ResultCard } from './PostObjects';
import {
  BookmarkIcon, HeartIcon, MoreIcon, ReplyIcon, RepostIcon,
} from './icons';
import type { PostToggleKind } from './useFeed';

/* ------------------------------------------------------------------ */
/* Words                                                                */
/* ------------------------------------------------------------------ */

const SPLIT = /(\$[A-Za-z]{1,5}\b|@Kai\b)/g;

/**
 * The post's words. A $cashtag is set in the brand ink and opens the symbol
 * (tickers are never plain text — the ticker rule); @Kai is violet because it
 * names Kai. Everything else is the body face, numbers included: a price in a
 * sentence is part of the sentence.
 */
export function FeedText({ text, onTicker, size, testID }: {
  text: string; onTicker?: (s: string) => void; size?: 'body' | 'meta'; testID?: string;
}) {
  const parts = text.split(SPLIT).filter(Boolean);
  const variant = size ?? 'body';
  return (
    <T variant={variant} c={color.textPrimary} testID={testID}>
      {parts.map((p, i) => {
        if (/^\$[A-Za-z]{1,5}$/.test(p)) {
          const sym = p.slice(1).toUpperCase();
          return (
            <T
              key={i}
              variant={variant}
              weight="semibold"
              c={color.action}
              onPress={onTicker ? () => onTicker(sym) : undefined}
              accessibilityRole={onTicker ? 'link' : undefined}
            >
              {`$${sym}`}
            </T>
          );
        }
        if (p === '@Kai') return <T key={i} variant={variant} weight="semibold" c={color.kaiInk}>@Kai</T>;
        return <T key={i} variant={variant} c={color.textPrimary}>{p}</T>;
      })}
    </T>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                         */
/* ------------------------------------------------------------------ */

/** Up to three people in a thread, overlapped. The server picks them. */
export function Participants({ people, size = 20, testID }: { people: SocialAuthor[]; size?: number; testID?: string }) {
  if (!people.length) return null;
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center' }}>
      {people.slice(0, 3).map((p, i) => (
        <View
          key={p.user_id}
          style={{ marginLeft: i ? -size * 0.3 : 0, borderRadius: size, borderWidth: 1.5, borderColor: color.canvas }}
        >
          <Avatar initial={p.initial} url={p.avatar_url} size={size} />
        </View>
      ))}
    </View>
  );
}

function Action({ icon, count, on, label, onPress, testID }: {
  icon: React.ReactNode; count?: number | null; on?: boolean; label: string; onPress?: () => void; testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={count != null ? `${label}, ${count}` : label}
      accessibilityState={{ selected: !!on }}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, minWidth: 44, paddingRight: 4,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {icon}
      {count != null && count > 0 ? (
        <T variant="meta" c={on ? color.action : color.textSecondary}>{count.toLocaleString()}</T>
      ) : null}
    </Pressable>
  );
}

export function RepostedBy({ who }: { who: SocialAuthor }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 56, marginBottom: 2 }}>
      <RepostIcon size={14} />
      <T variant="meta" c={color.textSecondary}>{`${who.display_name} reposted`}</T>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The post                                                             */
/* ------------------------------------------------------------------ */

export function PostCard({
  post, onOpen, onToggle, onMore, onReply, detail = false, notice, testID,
}: {
  post: CommunityPost;
  /** Opens the thread. Absent on the thread's own head post. */
  onOpen?: () => void;
  onToggle: (kind: PostToggleKind) => void;
  onMore?: () => void;
  onReply?: () => void;
  /** The thread's head: words a size up, no clamp. */
  detail?: boolean;
  /** The server's sentence when a toggle was refused. */
  notice?: string | null;
  testID?: string;
}) {
  const router = useRouter();
  const scale = useTextScale();
  const p = post;
  const id = testID ?? `post-${p.id}`;
  const openSymbol = (s: string) => router.push(`/symbol/${encodeURIComponent(s)}` as never);
  const images = p.media.filter((m) => m.type === 'image') as unknown as MessageMedia[];
  const charts = p.media.filter((m): m is Extract<typeof m, { type: 'chart' }> => m.type === 'chart');
  const author = p.author;
  const avatarSize = 44;

  // A settled call shows its result card; the call itself stays for its levels.
  const resultCall = p.trade_call && p.result && p.trade_call.id === p.result.call_id ? p.trade_call : null;

  return (
    <View testID={`${id}-card`} style={{ paddingTop: 12, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: alpha.divider }}>
      {p.reposted_by ? <RepostedBy who={p.reposted_by} /> : null}
      <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: layout.gutter }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={author ? `Open ${author.display_name}'s profile` : 'Former member'}
          disabled={!author}
          onPress={() => author && router.push(`/contributor/${encodeURIComponent(author.user_id)}` as never)}
          style={{ width: avatarSize }}
        >
          <Avatar initial={author?.initial ?? '·'} url={author?.avatar_url ?? null} size={avatarSize} />
        </Pressable>

        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          {/* Name line. The name is a door and wears the belt; the handle and
              time are quiet; the overflow is the last thing on the line. */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: -2 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              {author ? (
                <MemberName
                  name={author.display_name}
                  userId={author.user_id}
                  belt={author.belt}
                  handle={author.handle}
                  showHandle
                  size={15 * 1}
                  handleSize={13}
                  suffix={<T variant="meta" c={color.textSecondary}>{p.time_label}</T>}
                  testID={`${id}-author`}
                />
              ) : (
                <T variant="body" weight="semibold" c={color.textSecondary}>Former member</T>
              )}
            </View>
            {onMore ? (
              <Pressable
                testID={`${id}-more`}
                accessibilityRole="button"
                accessibilityLabel="More"
                onPress={onMore}
                style={{ width: 36, height: 28, alignItems: 'flex-end', justifyContent: 'center' }}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
              >
                <MoreIcon />
              </Pressable>
            ) : null}
          </View>

          {/* The words open the thread — the most common tap on a post. */}
          {p.body ? (
            <Pressable
              testID={onOpen ? `${id}-open` : undefined}
              accessibilityRole={onOpen ? 'button' : 'text'}
              accessibilityHint={onOpen ? 'Opens the conversation' : undefined}
              disabled={!onOpen}
              onPress={onOpen}
              style={{ marginTop: -4 }}
            >
              <FeedText text={p.body} onTicker={openSymbol} size={detail ? 'body' : 'body'} />
            </Pressable>
          ) : null}

          {images.length ? <MediaStrip media={images} testID={`${id}-images`} /> : null}

          {charts.map((c, i) => (
            <PostChart
              key={`${c.symbol}-${i}`}
              testID={`post-chart-${p.id}-${i}`}
              symbol={c.symbol}
              timeframe={c.timeframe}
              levels={c.levels}
              height={Math.round(140 * Math.min(scale, 1.15))}
              onExpand={() => openSymbol(c.symbol)}
            />
          ))}

          {p.trade_call ? (
            <CallObject
              call={p.trade_call}
              testID={`post-call-${p.id}`}
              onOpen={() => openSymbol(p.trade_call!.symbol)}
            />
          ) : null}

          {p.result ? (
            <ResultCard result={p.result} call={resultCall} testID={`post-result-${p.id}`} onOpen={() => openSymbol(p.result!.symbol)} />
          ) : null}

          {/* reply · repost · like ........ bookmark */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: -4 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Action
                  testID={`${id}-reply`}
                  label="Reply"
                  icon={<ReplyIcon />}
                  count={p.reply_count}
                  onPress={onReply ?? onOpen}
                />
                <Participants people={p.participants} size={18} testID={`${id}-participants`} />
              </View>
              <Action
                testID={`${id}-repost`}
                label={p.reposted ? 'Undo repost' : 'Repost'}
                icon={<RepostIcon c={p.reposted ? color.action : color.textSecondary} />}
                count={p.repost_count}
                on={p.reposted}
                onPress={p.mine ? undefined : () => onToggle('repost')}
              />
              <Action
                testID={`${id}-like`}
                label={p.liked ? 'Unlike' : 'Like'}
                icon={<HeartIcon c={p.liked ? color.action : color.textSecondary} fill={p.liked} />}
                count={p.like_count}
                on={p.liked}
                onPress={() => onToggle('like')}
              />
            </View>
            <Action
              testID={`${id}-bookmark`}
              label={p.bookmarked ? 'Remove from saved' : 'Save'}
              icon={<BookmarkIcon c={p.bookmarked ? color.action : color.textSecondary} fill={p.bookmarked} />}
              on={p.bookmarked}
              onPress={() => onToggle('bookmark')}
            />
          </View>
          {notice ? <T variant="meta" c={color.textSecondary} style={{ marginTop: -6, marginBottom: 6 }}>{notice}</T> : null}
        </View>
      </View>
    </View>
  );
}
