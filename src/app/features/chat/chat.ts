import { Component, ElementRef, ViewChild, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  ChatEvent,
  ChatService,
  PersistedMessage,
  PersistedToolCall,
  SessionSummary
} from '../../core/services/chat.service';
import { MarkdownParserService } from '../../core/services/markdown-parser.service';
import { MarkdownRenderer } from '../../shared/components/markdown-renderer/markdown-renderer';

interface ToolCall {
  toolUseId: string;
  tool: string;
  input?: unknown;
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

const STORAGE_KEY = 'secondbrain-chat:lastSessionId';

function newSessionId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  /** Recent saved sessions (loaded once at mount + after each new message). */
  readonly history = signal<SessionSummary[]>([]);
  readonly historyOpen = signal(false);

  /** Stable session ID so the backend can resume across messages. */
  sessionId = newSessionId();

  private currentController: AbortController | null = null;

  readonly canSubmit = computed(() => !this.streaming() && this.draft().trim().length > 0);

  async ngOnInit(): Promise<void> {
    const health = await this.chatService.health();
    if (health) {
      this.backendStatus.set('online');
      this.backendInfo.set({ wiki_pages: health.wiki_pages, model: health.model });
      await this.refreshHistory();

      // Restore the last session if localStorage has one and it still exists.
      const stored = this.readStoredSessionId();
      if (stored) {
        const loaded = await this.loadSession(stored);
        if (!loaded) this.clearStoredSessionId();
      }
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
    this.writeStoredSessionId(this.sessionId);

    this.currentController = this.chatService.sendMessage(this.sessionId, text, {
      onEvent: (evt: ChatEvent) => this.onEvent(evt, assistantTurn),
      onClose: () => {
        this.streaming.set(false);
        this.currentController = null;
        this.scrollToBottom();
        // Refresh history list so the new/updated session shows up immediately.
        void this.refreshHistory();
      }
    });
  }

  cancel(): void {
    this.currentController?.abort();
  }

  /** Start a fresh chat. Old chat stays persisted; user can return via history. */
  newChat(): void {
    if (this.streaming()) this.cancel();
    this.sessionId = newSessionId();
    this.turns.set([]);
    this.lastStats.set(null);
    this.clearStoredSessionId();
    this.historyOpen.set(false);
  }

  async openSession(id: string): Promise<void> {
    if (this.streaming()) this.cancel();
    await this.loadSession(id);
    this.historyOpen.set(false);
  }

  toggleHistory(): void {
    this.historyOpen.set(!this.historyOpen());
    if (this.historyOpen()) void this.refreshHistory();
  }

  private async refreshHistory(): Promise<void> {
    const list = await this.chatService.listSessions();
    this.history.set(list);
  }

  /** Load a persisted session into the current view. Returns true on success. */
  private async loadSession(id: string): Promise<boolean> {
    const data = await this.chatService.loadHistory(id);
    if (!data || !data.exists) return false;
    this.sessionId = id;
    const restored: ChatTurn[] = data.messages.map(m => this.persistedToTurn(m));
    this.turns.set(restored);
    this.lastStats.set(null);
    this.writeStoredSessionId(id);
    this.scrollToBottom();
    return true;
  }

  private persistedToTurn(m: PersistedMessage): ChatTurn {
    if (m.role === 'user') {
      return { role: 'user', content: m.content };
    }
    return {
      role: 'assistant',
      content: m.content,
      html: m.content ? this.markdownParser.renderToHtml(m.content) : '',
      toolCalls: m.toolCalls?.map((tc: PersistedToolCall) => ({
        toolUseId: tc.toolUseId,
        tool: tc.tool,
        input: tc.input,
        result: tc.result
      }))
    };
  }

  private readStoredSessionId(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
  private writeStoredSessionId(id: string): void {
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode etc. */ }
  }
  private clearStoredSessionId(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  /** Mutate the in-progress assistant turn as events stream in. */
  private onEvent(evt: ChatEvent, assistant: ChatTurn): void {
    switch (evt.type) {
      case 'system':
        // Init event — no UI change needed beyond enabling sending
        return;

      case 'text':
        assistant.content += evt.text;
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

  /** Format an ISO timestamp as a friendly relative date. */
  relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return '';
    const ms = Date.now() - then;
    const min = Math.floor(ms / 60_000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
  }
}
