interface FocusScoreProps {
  score: number;
}

export function FocusScore({ score }: FocusScoreProps) {
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "hsl(var(--nest-blue))" : score >= 40 ? "hsl(var(--nest-warm-foreground))" : "hsl(var(--destructive))";

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
          <circle
            cx="60" cy="60" r="54" fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-heading font-bold text-foreground">{score}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Focus</span>
        </div>
      </div>
    </div>
  );
}
