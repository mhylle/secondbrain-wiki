import { Component, ElementRef, ViewChild, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ChatEvent, ChatService } from '../../core/services/chat.service';
import { MarkdownParserService } from '../../core/services/markdown-parser.service';
import { MarkdownRenderer } from '../../shared/components/markdown-renderer/markdown-renderer';

interface ToolCall {
  toolUseId: string;
  tool: string;
  input: unknown;
  result?: unknown;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  /** Raw markdown text (for assistant turns) or plain text (user). */
  content: string;
  /** Pre-rendered HTML for assistant turns; populated as text streams in. */
  html?: string;
  /** Tool invocations associated with this assistant turn. */
  toolCalls?: ToolCall[];
}

interface SessionStats {
  durationMs: number;
  apiEquivalentCostUsd?: number;
  tokens?: { input: number; output: number };
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule, MarkdownRenderer],
  templateUrl: './chat.html',
  styleUrl: './chat.css'
})
export class Chat implements OnInit {
  @ViewChild('scrollContainer') private scrollContainerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('inputArea') private inputAreaRef?: ElementRef<HTMLTextAreaElement>;

  private readonly chatService = inject(ChatService);
  private readonly markdownParser = inject(MarkdownParserService);

  readonly turns = signal<ChatTurn[]>([]);
  readonly draft = signal('');
  readonly streaming = signal(false);
  readonly backendStatus = signal<'unknown' | 'online' | 'offline'>('unknown');
  readonly backendInfo = signal<{ wiki_pages: number; model: string } | null>(null);
  readonly lastStats = signal<SessionStats | null>(null);

  /** Stable session ID so the backend can resume across messages. */
  private readonly sessionId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  private currentController: AbortController | null = null;

  readonly canSubmit = computed(() => !this.streaming() && this.draft().trim().length > 0);

  async ngOnInit(): Promise<void> {
    const health = await this.chatService.health();
    if (health) {
      this.backendStatus.set('online');
      this.backendInfo.set({ wiki_pages: health.wiki_pages, model: health.model });
    } else {
      this.backendStatus.set('offline');
    }
  }

  send(): void {
    if (!this.canSubmit()) return;

    const text = this.draft().trim();
    this.draft.set('');
    this.appendTurn({ role: 'user', content: text });
    const assistantTurn: ChatTurn = { role: 'assistant', content: '', html: '', toolCalls: [] };
    this.appendTurn(assistantTurn);
    this.scrollToBottom();
    this.streaming.set(true);

    this.currentController = this.chatService.sendMessage(this.sessionId, text, {
      onEvent: (evt: ChatEvent) => this.onEvent(evt, assistantTurn),
      onClose: () => {
        this.streaming.set(false);
        this.currentController = null;
        this.scrollToBottom();
      }
    });
  }

  cancel(): void {
    this.currentController?.abort();
  }

  /** Mutate the in-progress assistant turn as events stream in. */
  private onEvent(evt: ChatEvent, assistant: ChatTurn): void {
    switch (evt.type) {
      case 'system':
        // Init event — no UI change needed beyond enabling sending
        return;

      case 'text':
        assistant.content += evt.text;
        // Re-render markdown each time. Cheap at our volumes.
        assistant.html = this.markdownParser.renderToHtml(assistant.content);
        this.refreshTurns();
        this.scrollToBottom();
        return;

      case 'tool_use':
        assistant.toolCalls = [
          ...(assistant.toolCalls ?? []),
          { toolUseId: evt.toolUseId, tool: evt.tool, input: evt.input }
        ];
        this.refreshTurns();
        this.scrollToBottom();
        return;

      case 'tool_result': {
        const calls = assistant.toolCalls ?? [];
        const idx = calls.findIndex(c => c.toolUseId === evt.toolUseId);
        if (idx >= 0) {
          calls[idx] = { ...calls[idx], result: evt.result };
          assistant.toolCalls = calls;
          this.refreshTurns();
        }
        return;
      }

      case 'result':
        this.lastStats.set({
          durationMs: evt.durationMs,
          apiEquivalentCostUsd: evt.apiEquivalentCostUsd,
          tokens: evt.tokens
        });
        return;

      case 'error':
        assistant.content =
          assistant.content +
          (assistant.content ? '\n\n' : '') +
          `> [!warning]\n> ${evt.message}`;
        assistant.html = this.markdownParser.renderToHtml(assistant.content);
        this.refreshTurns();
        return;

      case 'done':
        return;
    }
  }

  private appendTurn(turn: ChatTurn): void {
    this.turns.set([...this.turns(), turn]);
  }

  private refreshTurns(): void {
    // Force re-emission so the template re-renders the mutated turn
    this.turns.set([...this.turns()]);
  }

  private scrollToBottom(): void {
    queueMicrotask(() => {
      const el = this.scrollContainerRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  /** UX: Enter to send, Shift+Enter for newline. */
  onTextareaKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  /** Cheap stringifier for tool input/result display. */
  formatJson(value: unknown): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  /** Truncate a tool result for the collapsed view. */
  shortPreview(result: unknown, max = 280): string {
    const text = this.formatJson(result);
    if (text.length <= max) return text;
    return text.slice(0, max) + '…';
  }
}
