import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, FileText, Lightbulb, Loader2, MessageSquarePlus, Send, Sparkles, Trash2, Upload,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { AIRecommendation, ConversationMessage } from "@/lib/types";
import { cn, formatDate, formatDateTime, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Textarea } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type AssistantTab = "chat" | "documents" | "recommendations";

export function AssistantPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<AssistantTab>("chat");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [bookFilter, setBookFilter] = useState("");
  const [message, setMessage] = useState("");
  const [insightPolling, setInsightPolling] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const status = useQuery({ queryKey: ["ai", "status"], queryFn: api.ai.status });
  const conversations = useQuery({ queryKey: ["ai", "conversations"], queryFn: api.ai.conversations });
  const books = useQuery({ queryKey: ["books", "assistant-picker"], queryFn: () => api.books.list({ page_size: 100, sort: "title", order: "asc" }) });
  const documents = useQuery({
    queryKey: ["ai", "documents"],
    queryFn: api.ai.documents,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      return items.some((item) => item.status === "processing" || item.status === "uploaded") ? 3000 : false;
    },
  });

  const conversation = useQuery({
    queryKey: ["ai", "conversation", conversationId],
    queryFn: () => api.ai.conversation(conversationId!),
    enabled: Boolean(conversationId),
  });

  useEffect(() => {
    if (conversationId || !conversations.data?.items.length) return;
    setConversationId(conversations.data.items[0].id);
  }, [conversationId, conversations.data?.items]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation.data?.messages.length]);

  const createConversation = useMutation({
    mutationFn: () => api.ai.createConversation(bookFilter || null),
    onSuccess: (result) => {
      setConversationId(result.id);
      setMessage("");
      void queryClient.invalidateQueries({ queryKey: ["ai", "conversations"] });
    },
    onError: (err) => toast.error("Could not start a conversation", err instanceof ApiError ? err.message : undefined),
  });

  const send = useMutation({
    mutationFn: (content: string) => api.ai.sendMessage(conversationId!, content),
    onSuccess: () => {
      setMessage("");
      void queryClient.invalidateQueries({ queryKey: ["ai", "conversation", conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["ai", "conversations"] });
    },
    onError: (err) => toast.error("The assistant could not reply", err instanceof ApiError ? err.message : undefined),
  });

  const removeConversation = useMutation({
    mutationFn: (id: string) => api.ai.deleteConversation(id),
    onSuccess: () => {
      setConversationId(null);
      void queryClient.invalidateQueries({ queryKey: ["ai", "conversations"] });
      toast.success("Conversation deleted");
    },
  });

  const uploadDocument = useMutation({
    mutationFn: ({ file, bookId }: { file: File; bookId?: string | null }) => api.ai.uploadDocument(file, bookId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ai", "documents"] });
      toast.success("Document uploaded", "Text extraction runs in the background worker.");
    },
    onError: (err) => toast.error("Upload failed", err instanceof ApiError ? err.message : undefined),
  });

  const deleteDocument = useMutation({
    mutationFn: (id: string) => api.ai.deleteDocument(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["ai", "documents"] }),
  });

  const extractInsights = useMutation({
    mutationFn: () => api.ai.extractInsights(null),
    onSuccess: async (result) => {
      setInsightPolling(true);
      toast.success("Insight extraction queued");
      try {
        for (let index = 0; index < 25; index += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
          const job = await api.jobs.get(result.job_id);
          if (job.status === "completed") {
            void queryClient.invalidateQueries({ queryKey: ["ai", "insights"] });
            void queryClient.invalidateQueries({ queryKey: ["knowledge"] });
            toast.success("Insights ready", "Review them in Notes → AI insights.");
            break;
          }
          if (job.status === "failed") {
            toast.error("Insight extraction failed", job.error ?? undefined);
            break;
          }
        }
      } catch {
        // status is best-effort; insights will still appear when the worker finishes
      } finally {
        setInsightPolling(false);
      }
    },
    onError: (err) => toast.error("Could not extract insights", err instanceof ApiError ? err.message : undefined),
  });

  const [recommendations, setRecommendations] = useState<AIRecommendation[] | null>(null);
  const recommend = useMutation({
    mutationFn: () => api.ai.recommendations(6),
    onSuccess: (result) => setRecommendations(result.items),
    onError: (err) => toast.error("Could not get recommendations", err instanceof ApiError ? err.message : undefined),
  });

  const aiStatus = status.data;
  const enabled = Boolean(aiStatus?.enabled && aiStatus?.external_processing);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        eyebrow="AI assistant"
        title="Think alongside your library"
        description="Ask questions grounded in your own books, notes and highlights. The assistant states what it does not have."
        actions={
          <>
            <Button variant="outline" onClick={() => extractInsights.mutate()} loading={extractInsights.isPending || insightPolling} disabled={!enabled}>
              <Lightbulb className="h-4 w-4" /> Extract insights
            </Button>
            <Button onClick={() => createConversation.mutate()} loading={createConversation.isPending} disabled={!enabled}>
              <MessageSquarePlus className="h-4 w-4" /> New chat
            </Button>
          </>
        }
      />

      {status.isLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : !enabled ? (
        <div className="rounded-md border border-warning/30 bg-warning/[0.06] p-4">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold"><Sparkles className="h-4 w-4 text-warning" /> AI is not active on this deployment</p>
          <p className="mt-1.5 max-w-3xl text-[12px] leading-6 text-muted-foreground">
            {aiStatus?.message ?? "An administrator must configure an AI provider."} The rest of BookVault works fully without it.
            To enable: set <code className="font-mono text-[11px]">AI_PROVIDER</code>, <code className="font-mono text-[11px]">AI_BASE_URL</code>,{" "}
            <code className="font-mono text-[11px]">AI_MODEL</code> and <code className="font-mono text-[11px]">AI_API_KEY</code> on the server,
            then enable AI and external processing consent in Settings.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
          <Badge className="bg-success/10 text-success">{aiStatus?.provider}</Badge>
          <span>{aiStatus?.model}</span>
          <span className="text-border">·</span>
          <span>{aiStatus?.remaining_today} of {aiStatus?.daily_limit} requests left today</span>
          <span className="text-border">·</span>
          <span>{aiStatus?.external_processing ? "External processing consented" : "Local processing"}</span>
        </div>
      )}

      <Tabs
        tabs={[
          { value: "chat", label: "Conversations" },
          { value: "documents", label: "Source documents", count: documents.data?.items.length },
          { value: "recommendations", label: "Recommendations" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "chat" && (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card className="h-fit">
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px]">Conversations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {conversations.isLoading ? (
                <Skeleton className="h-32" />
              ) : conversations.data?.items.length ? (
                <div className="max-h-[420px] space-y-1 overflow-auto scrollbar-thin">
                  {conversations.data.items.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "group flex items-center gap-1 rounded-md px-2 py-1.5 text-[12.5px] transition-colors",
                        conversationId === item.id ? "bg-primary/10 text-primary" : "hover:bg-muted/60",
                      )}
                    >
                      <button className="min-w-0 flex-1 text-left" onClick={() => setConversationId(item.id)}>
                        <span className="block truncate font-medium">{item.title}</span>
                        <span className="block text-[10px] text-muted-foreground">{relativeTime(item.updated_at)}</span>
                      </button>
                      <button
                        onClick={() => removeConversation.mutate(item.id)}
                        className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-3 text-[11.5px] leading-5 text-muted-foreground">No conversations yet. Start one to begin.</p>
              )}
              <div className="border-t border-border/60 pt-2">
                <label htmlFor="assistant-book" className="label text-[10px]">Ground in a book</label>
                <Select id="assistant-book" value={bookFilter} onChange={(event) => setBookFilter(event.target.value)} className="h-8 text-[11.5px]">
                  <option value="">Whole library</option>
                  {books.data?.items.map((book) => (
                    <option key={book.id} value={book.id}>{book.book.title}</option>
                  ))}
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="flex min-h-[480px] flex-col">
            <CardHeader className="flex-row items-center justify-between border-b border-border/60 pb-3">
              <div>
                <CardTitle className="text-[14px]">{conversation.data?.title ?? "New conversation"}</CardTitle>
                {conversation.data?.user_book_id && (
                  <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                    Grounded in {books.data?.items.find((book) => book.id === conversation.data?.user_book_id)?.book.title ?? "one book"}
                  </p>
                )}
              </div>
              {conversation.data?.messages.length ? (
                <span className="text-[10.5px] text-muted-foreground">{conversation.data.messages.length} messages</span>
              ) : null}
            </CardHeader>
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-auto px-4 py-4 scrollbar-thin" style={{ maxHeight: 480 }}>
              {!conversationId ? (
                <div className="flex h-full flex-col items-center justify-center py-12 text-center">
                  <Sparkles className="h-6 w-6 text-primary" />
                  <p className="mt-2 text-[13px] font-medium">Start a conversation</p>
                  <p className="mt-1 max-w-sm text-[11.5px] leading-5 text-muted-foreground">
                    Ask about themes across your library, compare two books, or request a study guide for something you are reading.
                  </p>
                  <Button size="sm" className="mt-3" onClick={() => createConversation.mutate()} disabled={!enabled}>
                    <MessageSquarePlus className="h-3.5 w-3.5" /> New chat
                  </Button>
                </div>
              ) : conversation.isLoading ? (
                <Skeleton className="h-40" />
              ) : conversation.data?.messages.length ? (
                conversation.data.messages.map((item) => <MessageBubble key={item.id} message={item} />)
              ) : (
                <div className="py-10 text-center text-[12px] text-muted-foreground">
                  This conversation is empty. Ask the first question below.
                </div>
              )}
              {send.isPending && (
                <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking with your notes…
                </div>
              )}
            </div>
            <div className="border-t border-border/60 p-3">
              <form
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const content = message.trim();
                  if (!content || !conversationId) return;
                  send.mutate(content);
                }}
              >
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      const content = message.trim();
                      if (content && conversationId) send.mutate(content);
                    }
                  }}
                  rows={2}
                  placeholder={conversationId ? "Ask a question about your reading…" : "Start a conversation first"}
                  className="min-h-[52px] resize-none"
                  disabled={!conversationId || send.isPending}
                />
                <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!message.trim() || !conversationId} loading={send.isPending} aria-label="Send message">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
              <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
                The assistant can be wrong. Verify anything important against the book itself.
              </p>
            </div>
          </Card>
        </div>
      )}

      {tab === "documents" && (
        <div className="space-y-4">
          <div className="rounded-md border border-border/70 bg-card p-4">
            <p className="text-[13px] font-semibold">Give the assistant more to read</p>
            <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
              Upload a PDF, TXT or Markdown file (up to 10 MB). Text is extracted by the worker, then summaries can cite it.
              Files are stored privately and only used for your account.
            </p>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-[12.5px] font-medium hover:bg-muted/60">
              <Upload className="h-3.5 w-3.5" /> Choose a file
              <input
                type="file"
                accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadDocument.mutate({ file });
                  event.target.value = "";
                }}
              />
            </label>
          </div>

          {documents.isLoading ? (
            <Skeleton className="h-32" />
          ) : documents.data?.items.length ? (
            <div className="space-y-2">
              {documents.data.items.map((document) => (
                <div key={document.id} className="surface flex items-center gap-3 p-3.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{document.filename}</p>
                    <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                      {(document.size_bytes / 1024).toFixed(0)} KB · {formatDate(document.created_at)} ·{" "}
                      {document.status === "ready" ? `${document.chars.toLocaleString()} characters` : document.status}
                      {document.error ? ` · ${document.error}` : ""}
                    </p>
                  </div>
                  <Badge className={document.status === "ready" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>
                    {document.status}
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => deleteDocument.mutate(document.id)} aria-label="Delete document">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={BookOpen} title="No source documents" description="Upload a file to let the assistant quote from it directly." />
          )}
        </div>
      )}

      {tab === "recommendations" && (
        <div className="space-y-4">
          <div className="rounded-md border border-border/70 bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[13px] font-semibold">AI suggestions, verified against the catalogue</p>
                <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
                  Suggestions are labelled when metadata could not be verified. Nothing is added to your library automatically.
                </p>
              </div>
              <Button onClick={() => recommend.mutate()} loading={recommend.isPending} disabled={!enabled}>
                <Sparkles className="h-4 w-4" /> Suggest books
              </Button>
            </div>
          </div>
          {recommendations ? (
            recommendations.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {recommendations.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="surface p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-display text-[15px] font-semibold">{item.title}</p>
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">{item.authors.join(", ")}</p>
                      </div>
                      <Badge className={item.metadata_verified ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}>
                        {item.metadata_verified ? "Verified" : "AI only"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-[12px] leading-6 text-foreground/80">{item.reason}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.genres.map((genre) => <Badge key={genre} className="text-[9.5px]">{genre}</Badge>)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-[12.5px] text-muted-foreground">No suggestions came back. Try again after reading a little more.</p>
            )
          ) : (
            <EmptyState icon={Sparkles} title="No suggestions yet" description="Ask for ideas based on what you have rated highly and what is on your wishlist." />
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-2.5", isUser && "flex-row-reverse")}>
      <span className={cn(
        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
        isUser ? "bg-foreground text-background" : "bg-primary/10 text-primary",
      )}>
        {isUser ? "You" : <Sparkles className="h-3.5 w-3.5" />}
      </span>
      <div className={cn("max-w-[85%] rounded-lg px-3.5 py-2.5", isUser ? "bg-foreground text-background" : "bg-muted/60")}>
        <p className="whitespace-pre-line text-[12.5px] leading-6">{message.content}</p>
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1 border-t border-border/40 pt-2">
            {message.citations.map((citation, index) => (
              <span key={index} className="rounded-full bg-background/60 px-2 py-0.5 text-[9.5px] text-muted-foreground">
                {citation.label ?? citation.type}
              </span>
            ))}
          </div>
        )}
        <p className={cn("mt-1 text-[9.5px]", isUser ? "text-background/60" : "text-muted-foreground")} title={formatDateTime(message.created_at)}>
          {relativeTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}
