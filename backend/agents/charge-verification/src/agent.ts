import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import OpenAI from 'openai';
import {
  AgentCard,
  AgentCapabilities,
  AgentSkill,
  TaskState,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
} from '@a2a-js/sdk';
import {
  AgentExecutor,
  DefaultRequestHandler,
  InMemoryTaskStore,
  RequestContext,
  ExecutionEventBus,
} from '@a2a-js/sdk/server';
import { A2AExpressApp, UserBuilder } from '@a2a-js/sdk/server/express';

const PORT = 4001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.LLM_MODEL || 'gpt-4.1-mini';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Mock charge data
const MOCK_CHARGE = {
  id: 'TXN-8827193',
  amount: '$299.99',
  merchant: 'TechStore Pro',
  date: '2026-04-28',
  cardLast4: '4821',
  status: 'Pending',
  customer: {
    name: 'John Smith',
    address: '123 Park Avenue, New York, NY 10001',
  },
};

// Check if customer is disputing
function isDispute(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('no') || lower.includes('never') || lower.includes('dispute') ||
    lower.includes('fraud') || lower.includes('unauthorized') || lower.includes("didn't") ||
    lower.includes('not me') || lower.includes('not mine');
}

// Generate response using LLM
async function generateResponse(text: string, chargeContext: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    if (isDispute(text)) {
      return `I understand you're disputing this charge. I'll escalate this to our Card Replacement team immediately due to potential fraud.

**Escalation Details:**
- Transaction: ${MOCK_CHARGE.id}
- Amount: ${MOCK_CHARGE.amount}
- Merchant: ${MOCK_CHARGE.merchant}
- Reason: Customer denies making this transaction

A Card Replacement agent will assist you shortly with securing your account and issuing a new card.`;
    }

    return `I found the charge you're asking about:

**Transaction Details:**
• Amount: ${MOCK_CHARGE.amount}
• Merchant: ${MOCK_CHARGE.merchant}
• Date: ${MOCK_CHARGE.date}
• Card ending: ${MOCK_CHARGE.cardLast4}
• Status: ${MOCK_CHARGE.status}

Did you make this charge? If yes, I can confirm the transaction. If no, I'll escalate this as potential fraud and connect you with our Card Replacement team.`;
  }

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a Charge Verification agent for American Express. ${chargeContext}

Customer's charge data:
- Transaction ID: ${MOCK_CHARGE.id}
- Amount: ${MOCK_CHARGE.amount}
- Merchant: ${MOCK_CHARGE.merchant}
- Date: ${MOCK_CHARGE.date}
- Card: ending ${MOCK_CHARGE.cardLast4}
- Status: ${MOCK_CHARGE.status}

If the customer disputes or denies the charge, say you'll escalate to Card Replacement due to potential fraud.`,
      },
      { role: 'user', content: text },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });

  return response.choices[0]?.message?.content || 'Unable to process request.';
}

// Delegate to card replacement
async function delegateToCardReplacement(text: string): Promise<string> {
  const response = await fetch('http://localhost:4002/a2a', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'tasks/send',
      params: {
        message: {
          role: 'user',
          parts: [{ kind: 'text', text }],
        },
      },
    }),
  });
  const data: any = await response.json();
  return data.result?.status?.message?.parts?.[0]?.text || 'Card Replacement agent processing.';
}

// Charge Verification Executor
class ChargeVerificationExecutor implements AgentExecutor {
  async execute(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const text = context.userMessage?.parts?.[0]?.kind === 'text'
      ? context.userMessage.parts[0].text
      : '';

    // Working status
    eventBus.publish({
      kind: 'status-update',
      taskId: context.taskId,
      contextId: context.contextId,
      status: {
        state: 'working' as TaskState,
        message: {
          kind: 'message',
          role: 'agent',
          parts: [{ kind: 'text', text: 'Looking up transaction...' }],
        },
      },
      final: false,
    } as TaskStatusUpdateEvent);

    let responseText: string;

    try {
      if (isDispute(text)) {
        // Customer disputes - delegate to card replacement
        const escalationNote = `FRAUD ESCALATION: Customer "${MOCK_CHARGE.customer.name}" disputes charge ${MOCK_CHARGE.id} for ${MOCK_CHARGE.amount} from ${MOCK_CHARGE.merchant}. Original message: "${text}"`;
        responseText = await delegateToCardReplacement(escalationNote);
      } else {
        // Present charge details and ask for confirmation
        responseText = await generateResponse(text, 'Present the charge details and ask if the customer recognizes it.');
      }
    } catch (error) {
      responseText = `Error processing request: ${error}`;
    }

    // Artifact
    eventBus.publish({
      kind: 'artifact-update',
      taskId: context.taskId,
      contextId: context.contextId,
      artifact: {
        artifactId: uuidv4(),
        name: 'result',
        parts: [{ kind: 'text', text: responseText }],
      },
    } as TaskArtifactUpdateEvent);

    // Complete
    eventBus.publish({
      kind: 'status-update',
      taskId: context.taskId,
      contextId: context.contextId,
      status: { state: 'completed' as TaskState },
      final: true,
    } as TaskStatusUpdateEvent);

    eventBus.finished();
  }

  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    eventBus.publish({
      kind: 'status-update',
      taskId,
      status: { state: 'canceled' as TaskState },
      final: true,
    } as TaskStatusUpdateEvent);
    eventBus.finished();
  }
}

// Agent Card
const agentCard: AgentCard = {
  name: 'Charge Verification',
  description: 'Investigates unrecognized or suspicious charges and handles disputes',
  url: `http://localhost:${PORT}`,
  version: '1.0.0',
  protocolVersion: '0.3',
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain'],
  capabilities: { streaming: true } as AgentCapabilities,
  skills: [
    {
      id: 'charge-lookup',
      name: 'Charge Lookup',
      description: 'Look up charge details from transaction history',
      tags: ['lookup', 'transaction'],
      examples: ['Look up the charge for $299.99', 'What charges do I have from TechStore Pro?'],
    } as AgentSkill,
    {
      id: 'charge-dispute',
      name: 'Charge Dispute',
      description: 'Handle dispute process for unrecognized charges',
      tags: ['dispute', 'fraud'],
      examples: ['I want to dispute this charge', "I didn't make this purchase"],
    } as AgentSkill,
  ],
};

// Build & start
const executor = new ChargeVerificationExecutor();
const requestHandler = new DefaultRequestHandler(agentCard, new InMemoryTaskStore(), executor);
const app = express();
app.use(express.json());

const a2aApp = new A2AExpressApp(requestHandler, UserBuilder.noAuthentication);
a2aApp.setupRoutes(app);

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', agent: 'charge-verification', port: PORT });
});

app.listen(PORT, () => {
  console.log(`🔍 Charge Verification Agent running on http://localhost:${PORT}`);
  console.log(`📋 Agent Card: http://localhost:${PORT}/.well-known/agent-card.json`);
});
