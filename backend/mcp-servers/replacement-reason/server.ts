import express from 'express';
import { McpTool, McpToolCall, McpToolResult, ReplacementReason } from '../../shared/types';

const app = express();
const PORT = 4102;

app.use(express.json());

// Tool definitions
const tools: McpTool[] = [
  {
    name: 'get_replacement_reasons',
    description: 'Get available reasons for card replacement',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'select_replacement_reason',
    description: 'Select a reason for card replacement',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Customer ID' },
        foundReason: { 
          type: 'string', 
          description: 'Reason for replacement',
          enum: ['lost', 'stolen', 'damaged', 'fraud', 'unrecognized-charge']
        },
        description: { type: 'string', description: 'Additional details about the reason' }
      },
      required: ['customerId', 'reason']
    }
  },
  {
    name: 'get_replacement_details',
    description: 'Get details about the replacement process based on reason',
    inputSchema: {
      type: 'object',
      properties: {
        foundReason: { 
          type: 'string', 
          description: 'Reason for replacement',
          enum: ['lost', 'stolen', 'damaged', 'fraud', 'unrecognized-charge']
        }
      },
      required: ['reason']
    }
  }
];

// Mocked replacement reasons
const replacementReasons = [
  { 
    id: 'lost', 
    name: 'Lost', 
    description: 'Card is lost and cannot be located',
    priority: 'standard',
    immediateAction: false
  },
  { 
    id: 'stolen', 
    name: 'Stolen', 
    description: 'Card was stolen or used without authorization',
    priority: 'urgent',
    immediateAction: true
  },
  { 
    id: 'damaged', 
    name: 'Damaged', 
    description: 'Card is physically damaged and unreadable',
    priority: 'standard',
    immediateAction: false
  },
  { 
    id: 'fraud', 
    name: 'Fraud', 
    description: 'Suspected fraudulent activity on the account',
    priority: 'urgent',
    immediateAction: true
  },
  { 
    id: 'unrecognized-charge', 
    name: 'Unrecognized Charge', 
    description: 'Charge on account that is not recognized',
    priority: 'standard',
    immediateAction: false
  }
];

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'replacement-reason',
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
      case 'get_replacement_reasons':
        result = {
          content: {
            reasons: replacementReasons,
            message: 'Replacement reasons retrieved successfully'
          }
        };
        break;
        
      case 'select_replacement_reason':
        const { customerId, reason, description } = toolCall.arguments;
        const selectedReason = replacementReasons.find(r => r.id === reason);
        
        if (!selectedReason) {
          result = {
            content: { error: 'Invalid replacement reason' },
            isError: true
          };
        } else {
          result = {
            content: {
              customerId,
              foundReason: selectedReason,
              description: description || selectedReason.description,
              confirmationCode: `REASON-${reason.toUpperCase()}-${Date.now()}`,
              priority: selectedReason.priority,
              immediateAction: selectedReason.immediateAction,
              message: `Replacement reason '${selectedReason.name}' selected successfully`
            }
          };
        }
        break;
        
      case 'get_replacement_details':
        const { reason: reasonId } = toolCall.arguments;
        const foundReason = replacementReasons.find(r => r.id === reasonId);
        
        if (!foundReason) {
          result = {
            content: { error: 'Invalid replacement reason' },
            isError: true
          };
        } else {
          let details;
          switch (reasonId) {
            case 'lost':
              details = {
                processingTime: '1-2 business days',
                requiredActions: ['Verify identity', 'Cancel existing card'],
                notes: 'Standard processing time applies'
              };
              break;
            case 'stolen':
              details = {
                processingTime: 'Immediate',
                requiredActions: ['Block card immediately', 'Verify identity', 'Review recent transactions'],
                notes: 'Card blocked immediately for security'
              };
              break;
            case 'damaged':
              details = {
                processingTime: '1-2 business days',
                requiredActions: ['Verify card details', 'Confirm damage type'],
                notes: 'No immediate security concerns'
              };
              break;
            case 'fraud':
              details = {
                processingTime: 'Immediate',
                requiredActions: ['Block card immediately', 'Open fraud investigation', 'Review all transactions', 'Verify identity'],
                notes: 'Fraud investigation team notified'
              };
              break;
            case 'unrecognized-charge':
              details = {
                processingTime: '1-2 business days',
                requiredActions: ['Investigate charge', 'Verify with merchant', 'If confirmed fraud, escalate to fraud team'],
                notes: 'Charge investigation may take additional time'
              };
              break;
            default:
              details = {
                processingTime: 'Standard',
                requiredActions: ['Verify identity'],
                notes: 'Standard processing'
              };
          }
          
          result = {
            content: {
              reason,
              details,
              message: `Details for ${reason.name} replacement retrieved`
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
  console.log(`Replacement Reason MCP Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Available tools: ${tools.map(t => t.name).join(', ')}`);
});
