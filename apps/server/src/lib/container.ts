import { buildChannelRegistry } from "../channels/index.js";
import { ConversationService } from "../services/conversation.service.js";
import { CustomerService } from "../services/customer.service.js";
import { IngestService } from "../services/ingest.service.js";
import { MessageService } from "../services/message.service.js";
import { ReplyService } from "../services/reply.service.js";
import { prisma } from "./prisma.js";

export const channelRegistry = buildChannelRegistry();

const customers = new CustomerService(prisma);
const conversations = new ConversationService(prisma);
const messages = new MessageService(prisma);

export const ingestService = new IngestService(customers, conversations, messages);
export const replyService = new ReplyService(prisma, channelRegistry, messages);
