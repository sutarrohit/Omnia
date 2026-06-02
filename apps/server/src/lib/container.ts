import { buildChannelRegistry } from "../channels/index.js";
import { ConversationService } from "../services/conversation.service.js";
import { CustomerService } from "../services/customer.service.js";
import { IngestService } from "../services/ingest.service.js";
import { MessageService } from "../services/message.service.js";
import { ReplyService } from "../services/reply.service.js";
import { prisma } from "./prisma.js";
import { RealtimeHub } from "./realtime.js";

export const channelRegistry = buildChannelRegistry();
export const realtimeHub = new RealtimeHub();

const customers = new CustomerService(prisma);
export const conversationService = new ConversationService(prisma);
export const messageService = new MessageService(prisma);

export const ingestService = new IngestService(
  customers,
  conversationService,
  messageService,
  realtimeHub
);
export const replyService = new ReplyService(
  prisma,
  channelRegistry,
  messageService,
  realtimeHub
);
