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

const PORT = 4000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.LLM_MODEL || 'gpt-4.1-mini';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Intent classification
async function classifyIntent(text: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    // Fallback keyword matching
    const lower = text.toLowerCase();
    if (lower.includes('charge') || lower.includes('transaction') || lower.includes('fraud') || lower.includes('dispute') || lower.includes('unauthorized')) {
      return 'charge_verification';
    }
    if (lower.includes('replace') || lower.includes('card') || lower.includes('lost') || lower.includes('stolen') || lower.includes('damage')) {
      return 'card_replacement';
    }
    return 'general';
  }

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `Classify this customer message into exactly one category:
- charge_verification: about charges, transactions, disputes, fraud, unrecognized purchases
- card_replacement: about replacing card, lost card, stolen card, damaged card
- general: anything else

Respond with ONLY the category name.`,
      },
      { role: 'user', content: text },
    ],
    temperature: 0,
    max_tokens: 20,
  });

  return response.choices[0]?.message?.content?.trim().toLowerCase() || 'general';
}

// Generate natural response
async function generateResponse(text: string, context: string): Promise<string> {
  if (!OPENAI_API_KEY) {
    return `I received your message: "${text}". Let me route you to the right agent.`;
  }

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are AVA, an Advanced Virtual Assistant for American Express customer service. ${context}`,
      },
      { role: 'user', content: text },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });

  return response.choices[0]?.message?.content || 'I apologize, I could not generate a response.';
}

// Delegate to another agent via A2A protocol
async function delegateToAgent(agentUrl: string, text: string): Promise<string> {
  const response = await fetch(`${agentUrl}/a2a`, {
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
  return data.result?.status?.message?.parts?.[0]?.text || 'Delegation completed.';
}

// AVA Agent Executor
class AVAExecutor implements AgentExecutor {
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
          parts: [{ kind: 'text', text: 'Analyzing your request...' }],
        },
      },
      final: false,
    } as TaskStatusUpdateEvent);

    let responseText: string;

    try {
      const intent = await classifyIntent(text);

      if (intent === 'charge_verification') {
        responseText = await delegateToAgent('http://localhost:4001', text);
      } else if (intent === 'card_replacement') {
        responseText = await delegateToAgent('http://localhost:4002', text);
      } else {
        responseText = await generateResponse(text, 'Help the customer with their request.');
      }
    } catch (error) {
      responseText = `I apologize, an error occurred: ${error}`;
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
  name: 'AVA',
  description: 'Advanced Virtual Assistant - Routes customer requests to specialist agents',
  url: `http://localhost:${PORT}`,
  version: '1.0.0',
  protocolVersion: '0.3',
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain'],
  capabilities: { streaming: true } as AgentCapabilities,
  skills: [
    {
      id: 'task-routing',
      name: 'Task Routing',
      description: 'Routes customer requests to Charge Verification or Card Replacement agents',
      tags: ['routing', 'orchestration'],
      examples: [
        "I don't recognize a charge on my account",
        'I need to replace my credit card',
        "There's a suspicious transaction",
      ],
    } as AgentSkill,
  ],
};

// Build & start
const executor = new AVAExecutor();
const requestHandler = new DefaultRequestHandler(agentCard, new InMemoryTaskStore(), executor);
const app = express();
app.use(express.json());

const a2aApp = new A2AExpressApp(requestHandler, UserBuilder.noAuthentication);
a2aApp.setupRoutes(app);

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', agent: 'ava', port: PORT });
});

app.listen(PORT, () => {
  console.log(`🚀 AVA Agent running on http://localhost:${PORT}`);
  console.log(`📋 Agent Card: http://localhost:${PORT}/.well-known/agent-card.json`);
});
