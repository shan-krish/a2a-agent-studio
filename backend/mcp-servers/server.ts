import express from 'express';
import { readdirSync } from 'fs';
import { join } from 'path';

const app = express();
app.use(express.json());

// Load all tools from the tools directory
const toolsDir = join(__dirname, 'tools');
const tools: Map<string, (args: any) => Promise<any>> = new Map();

// Register tools dynamically
function loadTools() {
  try {
    const files = readdirSync(toolsDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
    for (const file of files) {
      try {
        // Dynamic import would be better but for simplicity we'll register manually
        console.log(`  Found tool file: ${file}`);
      } catch (e) {
        console.warn(`  Failed to load ${file}:`, e);
      }
    }
  } catch (e) {
    console.warn('Tools directory not found, using inline tools');
  }
}

// Inline MCP tools (mock data)
tools.set('get_mailing_address', async (args) => ({
  content: {
    customerId: args.customerId || 'CUST-001',
    address: {
      street: '123 Park Avenue',
      city: 'New York',
      state: 'NY',
      zip: '10001',
    },
    confirmed: true,
  },
}));

tools.set('get_delivery_options', async () => ({
  content: {
    options: [
      { id: 'standard', name: 'Standard', days: '5-7', cost: 'Free' },
      { id: 'express', name: 'Express', days: '2-3', cost: '$15.00' },
      { id: 'overnight', name: 'Overnight', days: '1', cost: '$25.00' },
    ],
  },
}));

tools.set('get_replacement_reasons', async () => ({
  content: {
    reasons: [
      { id: 'lost', name: 'Lost Card', priority: 'normal' },
      { id: 'stolen', name: 'Stolen Card', priority: 'high' },
      { id: 'damaged', name: 'Damaged Card', priority: 'normal' },
      { id: 'fraud', name: 'Fraud / Unauthorized', priority: 'urgent' },
    ],
  },
}));

tools.set('submit_replacement', async (args) => ({
  content: {
    success: true,
    confirmationNumber: `CR-${Date.now().toString(36).toUpperCase()}`,
    estimatedDelivery: args.delivery === 'overnight' ? 'Tomorrow' : args.delivery === 'express' ? '2-3 business days' : '5-7 business days',
    trackingNumber: `TRK${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
  },
}));

// MCP endpoint
app.post('/call-tool', async (req, res) => {
  const { name, arguments: args } = req.body;
  
  const tool = tools.get(name);
  if (!tool) {
    return res.status(404).json({ error: `Tool not found: ${name}` });
  }

  try {
    const result = await tool(args || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: `Tool execution failed: ${error}` });
  }
});

// List tools
app.get('/list-tools', (_req, res) => {
  res.json({
    tools: Array.from(tools.keys()).map(name => ({
      name,
      description: `MCP tool: ${name}`,
    })),
  });
});

// Health
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'mcp-server', port: 4100, tools: tools.size });
});

const PORT = 4100;
app.listen(PORT, () => {
  console.log(`🔧 MCP Server running on http://localhost:${PORT}`);
  console.log(`📦 Tools: ${Array.from(tools.keys()).join(', ')}`);
});
