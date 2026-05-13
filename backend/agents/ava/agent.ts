import { v4 as uuidv4 } from 'uuid';
import express from 'express';
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
import { LLMService } from '../../shared/llm-service';

// AVA Agent Executor
class AVAExecutor implements AgentExecutor {
  private llm: LLMService;

  constructor() {
    this.llm = new LLMService();
  }

  async execute(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const userMessage = context.userMessage;
    const text = userMessage?.parts?.[0]?.kind === 'text' ? userMessage.parts[0].text : '';

    // Publish working status
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

    // Classify intent using LLM
    const intentPrompt = `Classify this customer message into one of: charge_verification, card_replacement, general.
    Message: "${text}"
    Respond with only the category name.`;
    const intent = (await this.llm.generateResponse(intentPrompt, 'system', [])).trim().toLowerCase();

    let responseText: string;

    if (intent.includes('charge')) {
      responseText = await this.delegateToAgent('http://localhost:4001', text);
    } else if (intent.includes('card') || intent.includes('replacement')) {
      responseText = await this.delegateToAgent('http://localhost:4002', text);
    } else {
      responseText = await this.llm.generateResponse(text, 'ava', []);
    }

    // Publish artifact
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

  private async delegateToAgent(agentUrl: string, text: string): Promise<string> {
    try {
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
    } catch (error) {
      return `Error delegating to agent: ${error}`;
    }
  }
}

// Agent Card
const skill: AgentSkill = {
  id: 'task-routing',
  name: 'Task Routing',
  description: 'Analyzes customer requests and routes to appropriate specialist agents',
  tags: ['routing', 'orchestration', 'customer-service'],
  examples: [
    "I don't recognize a charge on my account",
    'I need to replace my credit card',
    "There's a suspicious transaction",
  ],
};

const agentCard: AgentCard = {
  name: 'AVA',
  description: 'Advanced Virtual Assistant - Central routing agent',
  url: 'http://localhost:4000',
  version: '1.0.0',
  protocolVersion: '0.3',
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain'],
  capabilities: { streaming: true } as AgentCapabilities,
  skills: [skill],
};

// Build app using official SDK
const executor = new AVAExecutor();
const requestHandler = new DefaultRequestHandler(
  agentCard,
  new InMemoryTaskStore(),
  executor
);

const app = express();
app.use(express.json());

// A2A routes via SDK
const a2aApp = new A2AExpressApp(requestHandler, UserBuilder.noAuthentication);
a2aApp.setupRoutes(app);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', agent: 'ava', port: 4000 });
});

// Start
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`🚀 AVA Agent running on http://localhost:${PORT}`);
  console.log(`📋 Agent Card: http://localhost:${PORT}/.well-known/agent-card.json`);
});

export { app, AVAExecutor, agentCard };
