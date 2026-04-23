import { Sparkles, ArrowRight } from "lucide-react";

export function SmartRecommendation() {
  return (
    <div className="rounded-2xl nest-gradient-primary p-5 text-primary-foreground animate-fade-in-up">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary-foreground/20 backdrop-blur flex items-center justify-center flex-shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium opacity-80 mb-1">What to focus on next</p>
          <h3 className="font-heading font-semibold text-base mb-1">Review Q4 presentation deck</h3>
          <p className="text-xs opacity-70">Based on your schedule & priority level. Meeting starts in 2 hours.</p>
        </div>
      </div>
      <button className="mt-4 flex items-center gap-2 text-xs font-medium bg-primary-foreground/15 hover:bg-primary-foreground/25 rounded-lg px-3 py-2 transition-colors">
        Start now <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
