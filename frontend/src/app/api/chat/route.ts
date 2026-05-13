import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, agentId = 'orchestrator' } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // JSON-RPC request for A2A protocol
    const rpcRequest = {
      jsonrpc: '2.0',
      id: Date.now().toString(),
      method: 'tasks/send',
      params: {
        id: Date.now().toString(),
        message: {
          role: 'user',
          content: message,
        },
      },
    };

    const response = await fetch(`${BACKEND_URL}/a2a`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcRequest),
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }

    // Return a mock response if backend is unavailable
    return NextResponse.json({
      jsonrpc: '2.0',
      id: rpcRequest.id,
      result: {
        id: Date.now().toString(),
        content: 'I understand you have a question. The backend service is currently unavailable, but I\'m here to help. Please try again in a moment.',
        agentId: 'orchestrator',
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    // Return mock response on error
    return NextResponse.json({
      jsonrpc: '2.0',
      id: Date.now().toString(),
      result: {
        id: Date.now().toString(),
        content: 'I apologize, but I\'m having trouble connecting to the agent service. Please ensure the backend is running and try again.',
        agentId: 'orchestrator',
      },
    });
  }
}
