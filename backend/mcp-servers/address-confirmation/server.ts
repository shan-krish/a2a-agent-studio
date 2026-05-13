import express from 'express';
import { McpTool, McpToolCall, McpToolResult } from '../../shared/types';

const app = express();
const PORT = 4100;

app.use(express.json());

// Mocked customer data
const mockCustomer = {
  id: 'CUST-001',
  name: 'John Smith',
  address: {
    street: '123 Park Avenue',
    city: 'New York',
    state: 'NY',
    zip: '10001'
  },
  card: {
    lastFour: '4821',
    expiration: '08/27'
  }
};

// Tool definitions
const tools: McpTool[] = [
  {
    name: 'get_mailing_address',
    description: 'Retrieve the customer\'s current mailing address',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Customer ID' }
      },
      required: ['customerId']
    }
  },
  {
    name: 'confirm_address',
    description: 'Confirm the mailing address for card shipment',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Customer ID' },
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            zip: { type: 'string' }
          },
          required: ['street', 'city', 'state', 'zip']
        }
      },
      required: ['customerId', 'address']
    }
  },
  {
    name: 'update_address',
    description: 'Update the mailing address for card shipment',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Customer ID' },
        newAddress: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            zip: { type: 'string' }
          },
          required: ['street', 'city', 'state', 'zip']
        }
      },
      required: ['customerId', 'newAddress']
    }
  }
];

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'address-confirmation',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// List tools endpoint
app.get('/list-tools', (req, res) => {
  res.json({ tools });
});

// Tool execution endpoint
app.post('/call-tool', (req, res) => {
  const toolCall: McpToolCall = req.body;
  
  try {
    let result: McpToolResult;
    
    switch (toolCall.name) {
      case 'get_mailing_address':
        result = {
          content: {
            customerId: mockCustomer.id,
            address: mockCustomer.address,
            confirmed: true
          }
        };
        break;
        
      case 'confirm_address':
        const { customerId, address } = toolCall.arguments;
        if (customerId !== mockCustomer.id) {
          result = {
            content: { error: 'Customer not found' },
            isError: true
          };
        } else {
          // Simulate confirmation
          result = {
            content: {
              customerId,
              address,
              confirmed: true,
              confirmationCode: `ADDR-CONF-${Date.now()}`,
              message: 'Address confirmed successfully'
            }
          };
        }
        break;
        
      case 'update_address':
        const { customerId: custId, newAddress } = toolCall.arguments;
        if (custId !== mockCustomer.id) {
          result = {
            content: { error: 'Customer not found' },
            isError: true
          };
        } else {
          // Simulate update
          result = {
            content: {
              customerId: custId,
              previousAddress: mockCustomer.address,
              newAddress,
              updated: true,
              updateCode: `ADDR-UPD-${Date.now()}`,
              message: 'Address updated successfully'
            }
          };
        }
        break;
        
      default:
        result = {
          content: { error: `Unknown tool: ${toolCall.name}` },
          isError: true
        };
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({
      content: { error: error instanceof Error ? error.message : 'Unknown error' },
      isError: true
    } as McpToolResult);
  }
});

app.listen(PORT, () => {
  console.log(`Address Confirmation MCP Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Available tools: ${tools.map(t => t.name).join(', ')}`);
});
