// Pure inbox sorting, shared by desktop and mobile UI.
// This is "needs reply", not a per-user unread receipt.
export type PriorityConversation = {
  id: string;
  ai_paused: boolean;
  assigned_to: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_message_at: string | null;
};

export function needsReply(c: PriorityConversation): boolean {
  const incoming = c.last_inbound_at ? Date.parse(c.last_inbound_at) : NaN;
  const outgoing = c.last_outbound_at ? Date.parse(c.last_outbound_at) : NaN;
  return Number.isFinite(incoming) && (!Number.isFinite(outgoing) || incoming > outgoing);
}

export function waitMinutes(c: PriorityConversation, now: number = Date.now()): number {
  if (!needsReply(c) || !c.last_inbound_at) return 0;
  return Math.max(0, Math.floor((now - Date.parse(c.last_inbound_at)) / 60000));
}

export function needsAttention(c: PriorityConversation, now: number = Date.now()): boolean {
  return needsReply(c) && (c.ai_paused || waitMinutes(c, now) >= 2);
}

export type InboxQueue = 'all' | 'attention' | 'mine' | 'unassigned';

export function matchesInboxQueue(c: PriorityConversation, queue: InboxQueue, userId: string): boolean {
  if (queue === 'attention') return needsReply(c);
  if (queue === 'mine') return !!userId && c.assigned_to === userId;
  if (queue === 'unassigned') return !c.assigned_to && needsReply(c);
  return true;
}

function timestamp(value: string | null): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

// Escalated human conversations first, then overdue replies, then fresh incoming.
// Within a waiting tier, oldest latest-inbound comes first; answered chats use recency.
// This measures the latest unanswered message, not the first in an unanswered burst.
export function priorityTier(c: PriorityConversation, now: number = Date.now()): number {
  if (needsReply(c) && c.ai_paused) return 0;
  if (needsReply(c) && waitMinutes(c, now) >= 2) return 1;
  if (needsReply(c)) return 2;
  if (c.assigned_to) return 3;
  return 4;
}

export function sortByPriority<T extends PriorityConversation>(items: readonly T[], now: number = Date.now()): T[] {
  return [...items].sort((a, b) => {
    const tierDifference = priorityTier(a, now) - priorityTier(b, now);
    if (tierDifference) return tierDifference;
    if (needsReply(a) && needsReply(b)) {
      const waitingDifference = timestamp(a.last_inbound_at) - timestamp(b.last_inbound_at);
      if (waitingDifference) return waitingDifference;
    }
    return timestamp(b.last_message_at) - timestamp(a.last_message_at) || a.id.localeCompare(b.id);
  });
}
