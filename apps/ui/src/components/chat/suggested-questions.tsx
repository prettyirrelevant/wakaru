interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
}

const SUGGESTED_QUESTIONS = [
  'total spending?',
  'who did I send money to most?',
  'biggest expense?',
  'spending by month?',
];

export function SuggestedQuestions({ onSelect }: SuggestedQuestionsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 justify-center">
      {SUGGESTED_QUESTIONS.map((q) => (
        <button
          key={q}
          onClick={() => onSelect(q)}
          className="tui-btn-ghost text-xs px-2 py-1"
        >
          [{q}]
        </button>
      ))}
    </div>
  );
}
