'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { askAssistantAction } from './actions';

type Msg = { id: string; role: string; content: string };

const SUGGESTIONS = ['Quanto IVA vou pagar este trimestre?', 'Posso deduzir as despesas do carro?', 'Quando tenho de entregar a declaração de IRS?'];

export function Chat({ threadId: initialThread, initial }: { threadId?: string; initial: Msg[] }) {
  const router = useRouter();
  const [threadId, setThreadId] = useState(initialThread);
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [text, setText] = useState('');
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function send(question: string) {
    const q = question.trim();
    if (q.length < 2 || pending) return;
    setError(undefined);
    setFollowUps([]);
    setText('');
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: 'user', content: q }]);
    start(async () => {
      const r = await askAssistantAction({ threadId, question: q });
      if (r.error) return setError(r.error);
      setMessages((m) => [...m, { id: `local-a-${Date.now()}`, role: 'assistant', content: r.answer! }]);
      setFollowUps(r.followUps ?? []);
      if (!threadId && r.threadId) {
        setThreadId(r.threadId);
        router.replace(`/app/assistente?c=${r.threadId}`, { scroll: false });
      }
    });
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3" aria-live="polite">
        {!messages.length && (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">Pergunta sobre os teus impostos, prazos ou despesas. As respostas usam os valores calculados pelo motor fiscal a partir da tua contabilidade.</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn('max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap', m.role === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted')}>
            {m.content}
          </div>
        ))}
        {pending && <div className="w-fit rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">A pensar…</div>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!!followUps.length && (
          <div className="flex flex-wrap gap-2">
            {followUps.map((f) => (
              <Button key={f} variant="ghost" size="sm" onClick={() => send(f)}>
                {f}
              </Button>
            ))}
          </div>
        )}
      </div>
      <form
        ref={formRef}
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label htmlFor="question" className="sr-only">
          A tua pergunta
        </label>
        <Textarea
          id="question"
          value={text}
          maxLength={2000}
          rows={2}
          placeholder="Escreve a tua pergunta…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
        />
        <Button type="submit" size="icon" disabled={pending || text.trim().length < 2} aria-label="Enviar">
          <Send />
        </Button>
      </form>
    </div>
  );
}
