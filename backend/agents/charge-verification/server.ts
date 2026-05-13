import express from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ChargeVerificationExecutor } from './executor';
import { JsonRpcRequest, JsonRpcResponse, TrailEvent } from '../../shared/types';

const app = express();
const PORT = 4001;

app.use(express.json());

// Load agent card
const agentCard = JSON.parse(readFileSync(join(__dirname, 'agent-card.json'), 'utf-8'));

// Trail event storage (for debugging/UI)
const trailEvents: TrailEvent[] = [];

// SSE clients for streaming
const sseClients = new Map<string, express.Response>();

// Initialize executor
const executor = new ChargeVerificationExecutor();

// Middleware to log requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'charge-verification-agent',
    port: PORT,
    activeTasks: sseClients.size,
    timestamp: new Date().toISOString()
  });
});

// Agent Card endpoint (A2A protocol)
app.get('/.well-known/agent.json', (req, res) => {
  res.json(agentCard);
});

// Trail events endpoint (for UI visualization)
app.get('/trail', (req, res) => {
  res.json({
    events: trailEvents,
    totalEvents: trailEvents.length,
    lastUpdated: trailEvents.length > 0 ? trailEvents[trailEvents.length - 1].timestamp : null
  });
});

// SSE endpoint for streaming trail events
app.get('/trail/stream', (req, res) => {
  const clientId = `client-${Date.now()}`;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  sseClients.set(clientId, res);
  
  // Send initial events
  trailEvents.forEach(event => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  req.on('close', () => {
    sseClients.delete(clientId);
  });
});

// Function to emit trail events
function emitTrailEvent(event: TrailEvent): void {
  trailEvents.push(event);
  
  // Keep only last 100 events
  if (trailEvents.length > 100) {
    trailEvents.shift();
  }
  
  // Broadcast to SSE clients
  const sseData = `data: ${JSON.stringify(event)}\n\n`;
  sseClients.forEach((client, clientId) => {
    try {
      client.write(sseData);
    } catch (error) {
      sseClients.delete(clientId);
    }
  });
}

// A2A JSON-RPC endpoint
app.post('/a2a', async (req, res) => {
  try {
    const request: JsonRpcRequest = req.body;
    
    if (!request.jsonrpc || request.jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: request.id || null,
        error: {
          code: -32600,
          message: 'Invalid JSON-RPC 2.0 request'
        }
      });
    }

    const response: JsonRpcResponse = await executor.handleTask(request, emitTrailEvent);
    res.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: {
        code: -32000,
        message: `Internal server error: ${errorMessage}`
      }
    });
  }
});

// List available methods
app.get('/methods', (req, res) => {
  res.json({
    methods: [
      {
        name: 'tasks/send',
        description: 'Send a message and get a task response'
      },
      {
        name: 'tasks/sendSubscribe',
        description: 'Send a message and subscribe to task updates via SSE'
      },
      {
        name: 'tasks/get',
        description: 'Get the current status of a task'
      },
      {
        name: 'tasks/cancel',
        description: 'Cancel a running task'
      }
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Charge Verification Agent running on port ${PORT}`);
  console.log(`Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
  console.log(`A2A Endpoint: http://localhost:${PORT}/a2a`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
  console.log(`Trail Events: http://localhost:${PORT}/trail`);
  console.log(`Trail Stream: http://localhost:${PORT}/trail/stream`);
  console.log(`Available Methods: http://localhost:${PORT}/methods`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down Charge Verification Agent...');
  sseClients.forEach(client => client.end());
  process.exit(0);
});
