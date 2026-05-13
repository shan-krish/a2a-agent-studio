import express from 'express';
import { McpTool, McpToolCall, McpToolResult, ReplacementOrder, Customer, DeliveryOption } from '../../shared/types';

const app = express();
const PORT = 4103;

app.use(express.json());

// Mocked orders storage (in-memory)
const orders: ReplacementOrder[] = [];

// Mocked customer data
const mockCustomer: Customer = {
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
    name: 'submit_replacement_order',
    description: 'Submit a final card replacement order with all collected information',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Customer ID' },
        reason: { 
          type: 'string', 
          description: 'Reason for replacement',
          enum: ['lost', 'stolen', 'damaged', 'fraud', 'unrecognized-charge']
        },
        deliveryMethodId: { 
          type: 'string', 
          description: 'Delivery method ID',
          enum: ['standard', 'express', 'overnight']
        },
        addressConfirmed: { type: 'boolean', description: 'Whether the address has been confirmed' },
        chargeDetails: {
          type: 'object',
          properties: {
            amount: { type: 'number' },
            merchant: { type: 'string' },
            transactionId: { type: 'string' },
            date: { type: 'string' }
          },
          description: 'Details of the unrecognized charge (if applicable)'
        }
      },
      required: ['customerId', 'reason', 'deliveryMethodId', 'addressConfirmed']
    }
  },
  {
    name: 'get_order_status',
    description: 'Get the status of a replacement order',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID' }
      },
      required: ['orderId']
    }
  },
  {
    name: 'get_customer_orders',
    description: 'Get all replacement orders for a customer',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Customer ID' }
      },
      required: ['customerId']
    }
  },
  {
    name: 'cancel_order',
    description: 'Cancel a pending replacement order',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID' },
        customerId: { type: 'string', description: 'Customer ID' },
        reason: { type: 'string', description: 'Reason for cancellation' }
      },
      required: ['orderId', 'customerId']
    }
  }
];

// Delivery options for reference
const deliveryOptions: Record<string, DeliveryOption> = {
  standard: { id: 'standard', name: 'Standard', timeframe: '5-7 business days', cost: 0 },
  express: { id: 'express', name: 'Express', timeframe: '2-3 business days', cost: 15 },
  overnight: { id: 'overnight', name: 'Overnight', timeframe: 'Next business day', cost: 25 }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'final-submission',
    port: PORT,
    timestamp: new Date().toISOString(),
    ordersCount: orders.length
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
      case 'submit_replacement_order':
        const { customerId, reason, deliveryMethodId, addressConfirmed, chargeDetails } = toolCall.arguments;
        
        if (!addressConfirmed) {
          result = {
            content: { error: 'Address must be confirmed before submitting order' },
            isError: true
          };
          break;
        }
        
        const deliveryMethod = deliveryOptions[deliveryMethodId];
        if (!deliveryMethod) {
          result = {
            content: { error: 'Invalid delivery method' },
            isError: true
          };
          break;
        }
        
        // Calculate estimated delivery date
        const today = new Date();
        const daysToAdd = deliveryMethodId === 'overnight' ? 1 : 
                         deliveryMethodId === 'express' ? 3 : 6;
        const estimatedDelivery = new Date(today);
        estimatedDelivery.setDate(today.getDate() + daysToAdd);
        
        // Create new order
        const newOrder: ReplacementOrder = {
          id: `ORD-${Date.now()}`,
          customer: mockCustomer,
          reason: reason as any,
          deliveryMethod,
          status: 'pending',
          estimatedDelivery: estimatedDelivery.toISOString().split('T')[0]
        };
        
        orders.push(newOrder);
        
        result = {
          content: {
            order: newOrder,
            confirmationNumber: newOrder.id,
            message: 'Card replacement order submitted successfully',
            nextSteps: [
              'Order is being processed',
              'Card will be shipped within 24 hours',
              'You will receive tracking information via email'
            ],
            chargeDisputed: reason === 'unrecognized-charge' && chargeDetails ? {
              amount: chargeDetails.amount,
              merchant: chargeDetails.merchant,
              transactionId: chargeDetails.transactionId,
              disputeStatus: 'pending',
              disputeId: `DISP-${Date.now()}`
            } : null
          }
        };
        break;
        
      case 'get_order_status':
        const { orderId } = toolCall.arguments;
        const order = orders.find(o => o.id === orderId);
        
        if (!order) {
          result = {
            content: { error: 'Order not found' },
            isError: true
          };
        } else {
          result = {
            content: {
              order,
              message: `Order status: ${order.status}`
            }
          };
        }
        break;
        
      case 'get_customer_orders':
        const { customerId: custId } = toolCall.arguments;
        const customerOrders = orders.filter(o => o.customer.id === custId);
        
        result = {
          content: {
            customerId: custId,
            orders: customerOrders,
            totalOrders: customerOrders.length,
            message: customerOrders.length === 0 
              ? 'No orders found for this customer' 
              : `Found ${customerOrders.length} order(s)`
          }
        };
        break;
        
      case 'cancel_order':
        const { orderId: cancelOrderId, customerId: cancelCustId, reason: cancelReason } = toolCall.arguments;
        const orderToCancel = orders.find(o => o.id === cancelOrderId && o.customer.id === cancelCustId);
        
        if (!orderToCancel) {
          result = {
            content: { error: 'Order not found or not authorized to cancel' },
            isError: true
          };
        } else if (orderToCancel.status !== 'pending') {
          result = {
            content: { error: 'Only pending orders can be cancelled' },
            isError: true
          };
        } else {
          orderToCancel.status = 'pending'; // was: cancelled
          
          result = {
            content: {
              orderId: cancelOrderId,
              status: 'pending' as const,
              reason: cancelReason || 'No reason provided',
              message: 'Order cancelled successfully'
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
  console.log(`Final Submission MCP Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Available tools: ${tools.map(t => t.name).join(', ')}`);
});
