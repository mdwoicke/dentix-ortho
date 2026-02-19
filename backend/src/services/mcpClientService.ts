import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import logger from '../utils/logger';

const MCP_ENDPOINT = process.env.API_AGENT_MCP_URL || 'http://localhost:3001/mcp';
const OPENAPI_SPEC_URL = process.env.OPENAPI_SPEC_URL || 'http://localhost:3002/api/docs/openapi.json';

class McpClientService {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;
  private queryToolName: string | null = null;

  /**
   * Get or create the MCP client connection.
   * Passes X-Target-URL and X-API-Type headers required by api-agent.
   */
  async getClient(): Promise<Client> {
    if (this.client) {
      return this.client;
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = this.connect();
    try {
      const client = await this.connecting;
      return client;
    } finally {
      this.connecting = null;
    }
  }

  private async connect(): Promise<Client> {
    logger.info(`[MCP] Connecting to api-agent at ${MCP_ENDPOINT}...`);

    const transport = new StreamableHTTPClientTransport(new URL(MCP_ENDPOINT), {
      requestInit: {
        headers: {
          'X-Target-URL': OPENAPI_SPEC_URL,
          'X-API-Type': 'rest',
        },
      },
    });
    const client = new Client({ name: 'dentix-ortho', version: '1.0.0' });

    try {
      await client.connect(transport);
      this.client = client;
      logger.info('[MCP] Connected to api-agent successfully');

      // Discover the query tool name (api-agent renames _query dynamically)
      await this.discoverQueryToolName(client);

      return client;
    } catch (err) {
      logger.error('[MCP] Failed to connect to api-agent', {
        error: err instanceof Error ? err.message : String(err),
        endpoint: MCP_ENDPOINT,
      });
      throw err;
    }
  }

  /**
   * Discover the dynamically-named query tool.
   * api-agent renames _query to {prefix}_query based on the X-Target-URL hostname.
   */
  private async discoverQueryToolName(client: Client): Promise<void> {
    try {
      const { tools } = await client.listTools();
      const queryTool = tools.find(t => t.name.endsWith('_query'));
      if (queryTool) {
        this.queryToolName = queryTool.name;
        logger.info(`[MCP] Discovered query tool: ${queryTool.name}`);
      } else {
        logger.warn('[MCP] No query tool found in tool list', {
          availableTools: tools.map(t => t.name),
        });
      }
    } catch (err) {
      logger.warn('[MCP] Failed to list tools for discovery', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Get the discovered query tool name, falling back to _query.
   */
  getQueryToolName(): string {
    return this.queryToolName || '_query';
  }

  /**
   * Call a tool on the MCP server.
   * Handles reconnection if the existing connection has dropped.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<any> {
    let client: Client;
    try {
      client = await this.getClient();
    } catch (err) {
      this.client = null;
      this.queryToolName = null;
      throw err;
    }

    try {
      const result = await client.callTool(
        { name, arguments: args },
        undefined,
        { timeout: 120_000 },
      );
      return result;
    } catch (err: any) {
      const isConnectionError =
        err?.code === 'ECONNREFUSED' ||
        err?.code === 'ECONNRESET' ||
        err?.message?.includes('not connected') ||
        err?.message?.includes('transport');

      if (isConnectionError) {
        logger.warn('[MCP] Connection lost, attempting reconnect...', {
          error: err instanceof Error ? err.message : String(err),
        });
        this.client = null;
        this.queryToolName = null;

        client = await this.getClient();
        return client.callTool(
          { name, arguments: args },
          undefined,
          { timeout: 120_000 },
        );
      }

      throw err;
    }
  }

  /**
   * Disconnect from the MCP server and release resources.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        logger.info('[MCP] Disconnected from api-agent');
      } catch (err) {
        logger.warn('[MCP] Error during disconnect', {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        this.client = null;
        this.queryToolName = null;
      }
    }
  }
}

export const mcpClientService = new McpClientService();
