import { McpToolCall, McpToolResult, TrailEvent } from './types';

export class McpClient {
  private baseUrl: string;
  private agentName: string;

  constructor(baseUrl: string, agentName: string) {
    this.baseUrl = baseUrl;
    this.agentName = agentName;
  }

  // Overload signatures
  callTool(toolName: string, args: Record<string, unknown>, emitTrail?: (event: TrailEvent) => void): Promise<McpToolResult>;
  callTool(toolCall: McpToolCall, emitTrail?: (event: TrailEvent) => void): Promise<McpToolResult>;
  // Implementation
  async callTool(toolNameOrCall: string | McpToolCall, argsOrEmit?: Record<string, unknown> | ((event: TrailEvent) => void), emitTrail?: (event: TrailEvent) => void): Promise<McpToolResult> {
    let toolCall: McpToolCall;
    let emitCallback: ((event: TrailEvent) => void) | undefined;
    
    if (typeof toolNameOrCall === 'string') {
      // First overload: toolName, args, emitTrail?
      toolCall = {
        name: toolNameOrCall,
        arguments: argsOrEmit as Record<string, unknown>
      };
      emitCallback = emitTrail;
    } else {
      // Second overload: toolCall, emitTrail?
      toolCall = toolNameOrCall;
      emitCallback = argsOrEmit as ((event: TrailEvent) => void) | undefined;
    }

    try {
      // Emit trail event for tool call
      if (emitCallback) {
        emitCallback({
          type: 'tool_call',
          agent: this.agentName,
          timestamp: new Date().toISOString(),
          data: {
            tool: toolCall.name,
            arguments: toolCall.arguments,
            endpoint: this.baseUrl
          }
        });
      }

      const response = await fetch(`${this.baseUrl}/call-tool`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toolCall),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: McpToolResult = await response.json() as McpToolResult;

      // Emit trail event for tool result
      if (emitCallback) {
        emitCallback({
          type: 'tool_result',
          agent: this.agentName,
          timestamp: new Date().toISOString(),
          data: {
            tool: toolCall.name,
            result: result.content,
            isError: result.isError || false
          }
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Emit trail event for error
      if (emitCallback) {
        emitCallback({
          type: 'tool_result',
          agent: this.agentName,
          timestamp: new Date().toISOString(),
          data: {
            tool: toolCall.name,
            error: errorMessage,
            isError: true
          }
        });
      }

      return {
        content: { error: errorMessage },
        isError: true
      };
    }
  }

  async listTools(): Promise<{ tools: any[] }> {
    try {
      const response = await fetch(`${this.baseUrl}/list-tools`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return (await response.json()) as { tools: any[] };
    } catch (error) {
      console.error(`Failed to list tools from ${this.baseUrl}:`, error);
      return { tools: [] };
    }
  }
}

// Factory function to create MCP clients for different services
export function createMcpClients(agentName: string) {
  return {
    addressConfirmation: new McpClient('http://localhost:4100', agentName),
    deliveryMethod: new McpClient('http://localhost:4101', agentName),
    replacementReason: new McpClient('http://localhost:4102', agentName),
    finalSubmission: new McpClient('http://localhost:4103', agentName)
  };
}