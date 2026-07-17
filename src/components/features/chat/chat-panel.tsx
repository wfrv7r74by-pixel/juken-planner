"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { clearChat, sendChatMessage } from "@/lib/actions/chat";
import { ProposalCard } from "@/components/features/chat/proposal-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/database";

const STARTERS = [
  "京大工学部を目指してる。2027年2月の二次試験までの戦略を一緒に立てたい",
  "平日のルーティンを作りたい。授業がある日は朝と夜しか勉強できない",
  "『やさしい理系数学』を教材に追加して。章立ても分けてほしい",
  "最近数学の進みが悪い。フェーズ計画を見直したい",
];

export function ChatPanel({ messages }: { messages: ChatMessage[] }) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, optimistic]);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || pending) return;
    setDraft("");
    setOptimistic(content);
    startTransition(async () => {
      const res = await sendChatMessage(content);
      if (res.error) {
        toast.error(res.error);
        setDraft(content); // 失敗時は入力を復元
      }
      setOptimistic(null);
    });
  };

  const onClear = () => {
    if (!confirm("チャット履歴をすべて削除しますか?")) return;
    startTransition(async () => {
      const res = await clearChat();
      if (res.error) toast.error(res.error);
    });
  };

  return (
    <div className="mx-auto flex h-[calc(100svh-8rem)] max-w-2xl flex-col md:h-[calc(100svh-7rem)]">
      <div className="flex items-center justify-between pb-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black">
            <Sparkles className="size-5 text-primary" /> AI相談
          </h1>
          <p className="text-xs text-muted-foreground">
            計画づくりのパートナー。提案は「反映」を押すまで保存されません
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear} disabled={pending}>
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>

      {/* メッセージ一覧 */}
      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {messages.length === 0 && !optimistic && (
          <div className="space-y-3 pt-6">
            <p className="text-center text-sm text-muted-foreground">
              まずは状況を教えてください。例えば…
            </p>
            {STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => send(starter)}
                disabled={pending}
                className="block w-full rounded-xl border bg-card p-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                {starter}
              </button>
            ))}
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
                message.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-card border",
              )}
            >
              {message.content}
            </div>
            {message.metadata?.proposals?.map((proposal, i) => (
              <div key={i} className="max-w-[85%]">
                <ProposalCard
                  messageId={message.id}
                  index={i}
                  proposal={proposal}
                />
              </div>
            ))}
          </div>
        ))}

        {optimistic && (
          <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
            {optimistic}
          </div>
        )}
        {pending && (
          <div className="flex max-w-[85%] items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            考え中…(Web検索する場合は少し時間がかかります)
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力欄 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex items-end gap-2 border-t pt-3"
      >
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send(draft);
            }
          }}
          rows={2}
          placeholder="相談したいことを入力(⌘+Enter で送信)"
          className="min-h-0 flex-1 resize-none"
          disabled={pending}
        />
        <Button type="submit" size="icon" disabled={pending || !draft.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
