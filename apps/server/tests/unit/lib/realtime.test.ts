import { describe, expect, it } from "vitest";
import { messageCreated, RealtimeHub, type RealtimeEvent } from "@/src/lib/realtime.js";

const sampleRow = {
  id: "m1",
  conversationId: "c1",
  direction: "INBOUND",
  type: "TEXT",
  content: "hi",
  status: "DELIVERED",
  createdAt: new Date(1_700_000_000 * 1000)
};

describe("RealtimeHub", () => {
  it("delivers published events to all subscribers", () => {
    const hub = new RealtimeHub();
    const a: RealtimeEvent[] = [];
    const b: RealtimeEvent[] = [];
    hub.subscribe((e) => a.push(e));
    hub.subscribe((e) => b.push(e));

    hub.publish(messageCreated(sampleRow));

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]).toMatchObject({ type: "message.created", conversationId: "c1" });
  });

  it("stops delivering after unsubscribe and tracks size", () => {
    const hub = new RealtimeHub();
    const received: RealtimeEvent[] = [];
    const unsubscribe = hub.subscribe((e) => received.push(e));
    expect(hub.size).toBe(1);

    unsubscribe();
    expect(hub.size).toBe(0);
    hub.publish(messageCreated(sampleRow));
    expect(received).toHaveLength(0);
  });
});

describe("messageCreated", () => {
  it("serializes createdAt to an ISO string", () => {
    const event = messageCreated(sampleRow);
    expect(event.message.createdAt).toBe(sampleRow.createdAt.toISOString());
    expect(event.message.content).toBe("hi");
  });
});
