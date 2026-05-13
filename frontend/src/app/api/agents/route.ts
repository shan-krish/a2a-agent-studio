import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/.well-known/agent.json`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }

    // Return default agents if discovery fails
    return NextResponse.json({
      agents: [
        {
          id: 'orchestrator',
          name: 'Orchestrator',
          description: 'Coordinates all agent interactions and manages task routing',
          status: 'online',
          color: '#006FCF',
          skills: ['Task Routing', 'Agent Coordination', 'Response Synthesis'],
          url: 'http://localhost:4000',
        },
        {
          id: 'charge-verification',
          name: 'Charge Verification',
          description: 'Handles charge inquiries, disputes, and transaction verification',
          status: 'online',
          color: '#00D4FF',
          skills: ['Transaction Lookup', 'Charge Dispute', 'Refund Processing'],
          url: 'http://localhost:4001',
        },
        {
          id: 'card-replacement',
          name: 'Card Replacement',
          description: 'Manages card replacement requests and activation',
          status: 'online',
          color: '#00C853',
          skills: ['Card Replacement', 'Expiry Management', 'Activation'],
          url: 'http://localhost:4002',
        },
      ],
    });
  } catch (error) {
    console.error('Agent discovery error:', error);
    // Return default agents on error
    return NextResponse.json({
      agents: [
        {
          id: 'orchestrator',
          name: 'Orchestrator',
          description: 'Coordinates all agent interactions',
          status: 'online',
          color: '#006FCF',
          skills: ['Task Routing', 'Agent Coordination'],
          url: 'http://localhost:4000',
        },
      ],
    });
  }
}
