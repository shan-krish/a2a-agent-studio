import { NextResponse } from 'next/server';

const PLATFORM_URL = process.env.PLATFORM_URL || 'http://localhost:3001';

export async function GET() {
  try {
    // Fetch agents from the platform discovery API
    const response = await fetch(`${PLATFORM_URL}/api/agents`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      
      // Transform platform agents to frontend format
      const agents = data.agents.map((agent: any, index: number) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        status: agent.status === 'running' ? 'online' : 'online',
        color: getAgentColor(index),
        skills: agent.skills?.map((s: any) => s.name) || [],
        url: agent.url,
        isActive: agent.status === 'running',
        lastActivity: new Date(),
      }));
      
      return NextResponse.json({ agents });
    }

    // Return default agents if platform is not available
    return NextResponse.json({
      agents: getDefaultAgents(),
    });
  } catch (error) {
    console.error('Failed to fetch from platform:', error);
    // Return default agents if platform is not available
    return NextResponse.json({
      agents: getDefaultAgents(),
    });
  }
}

function getAgentColor(index: number): string {
  const colors = ['#006FCF', '#00A3E0', '#00A86B', '#FFB300', '#E63946'];
  return colors[index % colors.length];
}

function getDefaultAgents() {
  return [
    {
      id: 'ava',
      name: 'AVA',
      description: 'Advanced Virtual Assistant - Coordinates all agent interactions and manages task routing',
      status: 'online',
      color: '#006FCF',
      skills: ['Task Routing', 'Agent Coordination', 'Response Synthesis'],
      url: 'http://localhost:4000',
      isActive: true,
      lastActivity: new Date(),
    },
    {
      id: 'charge-verification',
      name: 'Charge Verification',
      description: 'Handles charge inquiries, disputes, and transaction verification',
      status: 'online',
      color: '#00A3E0',
      skills: ['Transaction Lookup', 'Charge Dispute', 'Refund Processing'],
      url: 'http://localhost:4001',
      isActive: false,
      lastActivity: new Date(),
    },
    {
      id: 'card-replacement',
      name: 'Card Replacement',
      description: 'Manages card replacement requests and activation',
      status: 'online',
      color: '#00A86B',
      skills: ['Card Replacement', 'Expiry Management', 'Activation'],
      url: 'http://localhost:4002',
      isActive: false,
      lastActivity: new Date(),
    },
  ];
}
