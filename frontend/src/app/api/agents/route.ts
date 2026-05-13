import { NextResponse } from 'next/server';

const PLATFORM_URL = process.env.PLATFORM_URL || 'http://localhost:3001';

export async function GET() {
  try {
    const response = await fetch(`${PLATFORM_URL}/api/agents`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Platform returned an error', status: response.status },
        { status: response.status }
      );
    }

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
  } catch (error) {
    console.error('Failed to connect to agent platform:', error);
    return NextResponse.json(
      { 
        error: 'Agent platform is not running',
        message: 'Please start the backend platform: cd backend && npm run dev',
        platformUrl: PLATFORM_URL
      },
      { status: 503 }
    );
  }
}

function getAgentColor(index: number): string {
  const colors = ['#006FCF', '#00A3E0', '#00A86B', '#FFB300', '#E63946'];
  return colors[index % colors.length];
}
