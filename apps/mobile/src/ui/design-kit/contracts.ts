import type { TradeIdea, LevelKind } from './trading';
import type { CircleRoom, ConversationMessage, ConversationHistoryItem } from './conversation';
import type { Lesson, Skill, BeltRank } from './learning';

export const screenCatalog = [
  { id: 'identify', title: 'Choose your path', group: 'Onboarding' },
  { id: 'reveal', title: 'What CheatCode does', group: 'Onboarding' },
  { id: 'curiosity', title: 'Choose what comes next', group: 'Onboarding' },
  { id: 'plan', title: 'Personalized plan', group: 'Onboarding' },
  { id: 'signup', title: 'Create account', group: 'Onboarding' },
  { id: 'preferences', title: 'Confirm your starting point', group: 'Onboarding' },
  { id: 'home-beginner', title: 'Beginner Home', group: 'Home' },
  { id: 'home-developing', title: 'Developing Home', group: 'Home' },
  { id: 'home-ready', title: 'Trade Ready Home', group: 'Home' },
  { id: 'home-invest', title: 'Investor Home', group: 'Investing' },
  { id: 'research', title: 'Research desk', group: 'Investing' },
  { id: 'company', title: 'Company detail', group: 'Investing' },
  { id: 'alerts', title: 'Trade ideas', group: 'Trading' },
  { id: 'setup', title: 'Setup detail', group: 'Trading' },
  { id: 'analysis', title: 'Chart analysis', group: 'Trading' },
  { id: 'order-review', title: 'Order review', group: 'Trading' },
  { id: 'order-pending', title: 'Order pending', group: 'Trading' },
  { id: 'position', title: 'Active position', group: 'Trading' },
  { id: 'debrief', title: 'Trade review', group: 'Recovery' },
  { id: 'quiet', title: 'Quiet market', group: 'Recovery' },
  { id: 'offline', title: 'Offline recovery', group: 'Recovery' },
  { id: 'training', title: 'Training path', group: 'Learning' },
  { id: 'lesson', title: 'Ownership lesson', group: 'Learning' },
  { id: 'video', title: 'Companion video', group: 'Learning' },
  { id: 'lesson-complete', title: 'Lesson complete', group: 'Progression' },
  { id: 'skills', title: 'Skill progress', group: 'Progression' },
  { id: 'belt', title: 'Belt profile', group: 'Progression' },
  { id: 'community', title: 'Community room', group: 'Community' },
  { id: 'room-switcher', title: 'Switch room', group: 'Community' },
  { id: 'discussion', title: 'Focused discussion', group: 'Community' },
  { id: 'history', title: 'Kai conversations', group: 'Kai & account' },
  { id: 'kai', title: 'Contextual Kai chat', group: 'Kai & account' },
  { id: 'account', title: 'Account hub', group: 'Kai & account' },
  { id: 'guidance', title: 'Guidance & accessibility', group: 'Settings' },
  { id: 'notifications', title: 'Notification preferences', group: 'Settings' },
  { id: 'membership', title: 'Plan & credits', group: 'Settings' },
] as const;
export type ScreenId = typeof screenCatalog[number]['id'];
export type Persona = 'learn' | 'swing' | 'pro';
export type KitState = {
  persona: Persona; interest: string; level: LevelKind;
  alertFilter: 'active' | 'watching' | 'history';
  quantity: number; ownedShares: number; candlePart: 'body' | 'wick';
  guidance: 'guided' | 'concise'; textScale: number; reducedMotion: boolean;
  setupNotifications: boolean; communityNotifications: boolean; quietHours: boolean;
  email: string; password: string; formError?: string; busy?: boolean; watched?: boolean;
  roomId: string; threadId?: string;
};
export type KitAction =
  | { type: 'navigate'; screen: ScreenId }
  | { type: 'back' }
  | { type: 'state'; patch: Partial<KitState> }
  | { type: 'open-idea'; id: string }
  | { type: 'watch-idea'; id: string }
  | { type: 'open-room'; id: string }
  | { type: 'open-thread'; id: string }
  | { type: 'new-thread' }
  | { type: 'open-lesson'; id: string }
  | { type: 'open-company'; symbol: string }
  | { type: 'submit-order'; ideaId: string; quantity: number; execution: 'paper' | 'live' }
  | { type: 'create-account'; email: string; password: string }
  | { type: 'join-early-access' }
  | { type: 'confirm-preferences' }
  | { type: 'complete-lesson'; ownedShares: number }
  | { type: 'analyze-chart'; ideaId: string }
  | { type: 'play-video'; lessonId: string }
  | { type: 'open-transcript'; lessonId: string }
  | { type: 'retry' }
  | { type: 'test-notification' }
  | { type: 'open-privacy' }
  | { type: 'sign-out' };
/** Data has no fixture defaults. The host adapter owns sources, loading, billing and execution. */
export type KitData = {
  trade: TradeIdea; ideas: readonly TradeIdea[]; noLogo?: boolean;
  greeting: string; selectedLevelNotes: Record<LevelKind, string>;
  profile: { name: string; rank: BeltRank; progress: number; nextRank: string; balanceLabel: string };
  company: { symbol: string; name: string; description: string; whyWatch: string; risk: string; sourceLabel: string };
  companies: readonly { symbol: string; name: string; description: string }[];
  lessons: readonly Lesson[]; skills: readonly Skill[];
  video: { lessonId: string; title: string; creator: string; duration: string };
  rooms: readonly CircleRoom[]; messages: readonly ConversationMessage[]; threads: readonly ConversationHistoryItem[];
  plan: { name: string; priceLabel: string; availability: string; interests: readonly string[] };
  membership: { name: string; creditsUsed: number; creditsTotal: number; resetsLabel: string; included: readonly string[]; excluded: readonly string[] };
  execution: 'paper' | 'live';
  order: { statusLabel: string; filled: number; requested: number; asOf: string };
  position: { shares: number; entry: number; current: number | null; asOf: string };
  review: { title: string; lesson: string; exitPrice: number; shares: number; entry: number };
  connection: { lastUpdated: string; message: string };
  notificationDelivery: string;
};
