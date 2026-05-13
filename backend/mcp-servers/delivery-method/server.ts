import express from 'express';
import { McpTool, McpToolCall, McpToolResult, DeliveryOption } from '../../shared/types';

const app = express();
const PORT = 4101;

app.use(express.json());

// Mocked delivery options
const deliveryOptions: DeliveryOption[] = [
  { id: 'standard', name: 'Standard', timeframe: '5-7 business days', cost: 0 },
  { id: 'express', name: 'Express', timeframe: '2-3 business days', cost: 15 },
  { id: 'overnight', name: 'Overnight', timeframe: 'Next business day', cost: 25 }
];

// Tool definitions
const tools: McpTool[] = [
  {
    name: 'get_delivery_options',
    description: 'Get available delivery methods for card replacement',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Customer ID' }
      },
      required: ['customerId']
    }
  },
  {
    name: 'select_delivery_method',
    description: 'Select a delivery method for card replacement',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Customer ID' },
        deliveryMethodId: { 
          type: 'string', 
          description: 'Delivery method ID (standard, express, overnight)',
          enum: ['standard', 'express', 'overnight']
        }
      },
      required: ['customerId', 'deliveryMethodId']
    }
  },
  {
    name: 'get_delivery_cost',
    description: 'Get the cost for a specific delivery method',
    inputSchema: {
      type: 'object',
      properties: {
        deliveryMethodId: { 
          type: 'string', 
          description: 'Delivery method ID (standard, express, overnight)',
          enum: ['standard', 'express', 'overnight']
        }
      },
      required: ['deliveryMethodId']
    }
  }
];

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'delivery-method',
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
      case 'get_delivery_options':
        result = {
          content: {
            customerId: toolCall.arguments.customerId,
            options: deliveryOptions,
            message: 'Delivery options retrieved successfully'
          }
        };
        break;
        
      case 'select_delivery_method':
        const { customerId, deliveryMethodId } = toolCall.arguments;
        const selectedOption = deliveryOptions.find(opt => opt.id === deliveryMethodId);
        
        if (!selectedOption) {
          result = {
            content: { error: 'Invalid delivery method' },
            isError: true
          };
        } else {
          // Calculate estimated delivery date
          const today = new Date();
          const daysToAdd = selectedOption.id === 'overnight' ? 1 : 
                           selectedOption.id === 'express' ? 3 : 6;
          const estimatedDelivery = new Date(today);
          estimatedDelivery.setDate(today.getDate() + daysToAdd);
          
          result = {
            content: {
              customerId,
              deliveryMethod: selectedOption,
              estimatedDelivery: estimatedDelivery.toISOString().split('T')[0],
              confirmationCode: `DEL-${deliveryMethodId.toUpperCase()}-${Date.now()}`,
              message: `Delivery method '${selectedOption.name}' selected successfully`
            }
          };
        }
        break;
        
      case 'get_delivery_cost':
        const { deliveryMethodId: methodId } = toolCall.arguments;
        const option = deliveryOptions.find(opt => opt.id === methodId);
        
        if (!option) {
          result = {
            content: { error: 'Invalid delivery method' },
            isError: true
          };
        } else {
          result = {
            content: {
              deliveryMethod: option,
              cost: option.cost,
              currency: 'USD',
              message: option.cost === 0 ? 'Free delivery' : `Cost: $${option.cost.toFixed(2)}`
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
  console.log(`Delivery Method MCP Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Available tools: ${tools.map(t => t.name).join(', ')}`);
});
