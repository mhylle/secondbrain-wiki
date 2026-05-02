import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Discriminated union of events the chat backend streams over SSE.
 * Mirrors `AgentEvent` in chat-backend/src/agent.ts.
 */
export type ChatEvent =
  | { type: 'system'; subtype: string; sdkSessionId?: string; tools?: string[] }
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string; input: unknown; toolUseId: string }
  | { type: 'tool_result'; tool: string; result: unknown; toolUseId: string }
  | {
      type: 'result';
      subtype: string;
      durationMs: number;
      apiEquivalentCostUsd?: number;
      tokens?: { input: number; output: number };
    }
  | { type: 'error'; message: string }
  | { type: 'done' };

export interface ChatStreamHandlers {
  onEvent: (event: ChatEvent) => void;
  onClose: () => void;
}

/**
 * Talks to the local chat-backend (`localhost:8787` by default). POST /chat
 * with `{ session_id, message }`, parse the SSE response stream, dispatch
 * events to the caller via `handlers.onEvent`.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly backendUrl = environment.chatBackendUrl ?? 'http://localhost:8787';

  /**
   * Send a message and stream events back. Returns an AbortController whose
   * `.abort()` cancels the in-flight request.
   *
   * Uses fetch + ReadableStream rather than EventSource because EventSource
   * is GET-only; we need POST to send the message body.
   */
  sendMessage(
    sessionId: string,
    message: string,
    handlers: ChatStreamHandlers
  ): AbortController {
    const controller = new AbortController();

    fetch(`${this.backendUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, message }),
      signal: controller.signal
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Backend error: HTTP ${response.status}`);
        }
        if (!response.body) {
          throw new Error('Backend response had no body');
        }
        return this.consumeSseStream(response.body.getReader(), handlers);
      })
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') {
          handlers.onEvent({ type: 'error', message: 'Cancelled by user' });
        } else {
          handlers.onEvent({ type: 'error', message: (err as Error).message });
        }
      })
      .finally(() => {
        handlers.onClose();
      });

    return controller;
  }

  /**
   * Quick health check — returns `null` if backend is unreachable.
   */
  async health(): Promise<{ ok: boolean; wiki_pages: number; model: string } | null> {
    try {
      const res = await fetch(`${this.backendUrl}/health`);
      if (!res.ok) return null;
      return (await res.json()) as { ok: boolean; wiki_pages: number; model: string };
    } catch {
      return null;
    }
  }

  /**
   * Parse the SSE byte stream into discrete events, hand each to onEvent.
   * SSE format: blocks of `event: <name>\ndata: <json>\n\n`.
   */
  private async consumeSseStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    handlers: ChatStreamHandlers
  ): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events end on a double newline
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        this.parseAndDispatch(block, handlers);
      }
    }
    // Flush any trailing block (rare — most servers terminate cleanly)
    if (buffer.trim().length > 0) {
      this.parseAndDispatch(buffer, handlers);
    }
  }

  private parseAndDispatch(block: string, handlers: ChatStreamHandlers): void {
    const lines = block.split('\n');
    let dataPayload: string | null = null;

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        dataPayload = line.slice(6);
      }
    }

    if (!dataPayload) return;
    try {
      const parsed = JSON.parse(dataPayload) as ChatEvent;
      handlers.onEvent(parsed);
    } catch {
      // Malformed event — ignore rather than break the stream
    }
  }
}
