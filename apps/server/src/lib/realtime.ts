/** A serialized message as pushed to realtime subscribers. */
export interface RealtimeMessage {
  id: string;
  conversationId: string;
  direction: string;
  type: string;
  content: string | null;
  status: string;
  createdAt: string; // ISO timestamp
}

export interface MessageCreatedEvent {
  type: "message.created";
  conversationId: string;
  message: RealtimeMessage;
}

export type RealtimeEvent = MessageCreatedEvent;

type Listener = (event: RealtimeEvent) => void;

/**
 * In-process pub/sub for realtime fan-out. Fine for a single persistent Node
 * host (our Docker deployment); swap the transport here if we ever scale out.
 */
export class RealtimeHub {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: RealtimeEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  /** Number of active subscribers (handy for tests / diagnostics). */
  get size(): number {
    return this.listeners.size;
  }
}

/** Build a `message.created` event from a stored message row. */
export function messageCreated(m: {
  id: string;
  conversationId: string;
  direction: string;
  type: string;
  content: string | null;
  status: string;
  createdAt: Date;
}): MessageCreatedEvent {
  return {
    type: "message.created",
    conversationId: m.conversationId,
    message: {
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction,
      type: m.type,
      content: m.content,
      status: m.status,
      createdAt: m.createdAt.toISOString()
    }
  };
}
