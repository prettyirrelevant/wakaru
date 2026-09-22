interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
}

const SUGGESTED_QUESTIONS = [
  'How much did I spend?',
  'Who did I pay most?',
  'What was my biggest expense?',
  'Show my monthly spending.',
];

export function SuggestedQuestions({ onSelect }: SuggestedQuestionsProps) {
  return (
    <div>
      <p className="mb-3 text-center text-xs text-muted-foreground">&gt; try a question</p>
      <div className="grid gap-2 sm:grid-cols-2">
      {SUGGESTED_QUESTIONS.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onSelect(q)}
          className="touch-manipulation border border-border bg-surface px-3 py-2.5 text-left text-xs font-medium transition-colors hover:border-accent/40 hover:bg-accent/[0.05]"
        >
          {q}
        </button>
      ))}
      </div>
    </div>
  );
}
