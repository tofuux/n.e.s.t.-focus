import { useState } from "react";

const moods = [
  { emoji: "😔", label: "Low", value: 1 },
  { emoji: "😐", label: "Meh", value: 2 },
  { emoji: "🙂", label: "Okay", value: 3 },
  { emoji: "😊", label: "Good", value: 4 },
  { emoji: "🤩", label: "Great", value: 5 },
];

export function MoodCheckIn() {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-3">How are you feeling?</p>
      <div className="flex gap-2">
        {moods.map((mood) => (
          <button
            key={mood.value}
            onClick={() => setSelected(mood.value)}
            className={`flex flex-col items-center gap-1 p-2.5 rounded-xl transition-all duration-200 ${
              selected === mood.value
                ? "bg-accent scale-110 nest-shadow-soft"
                : "hover:bg-muted"
            }`}
          >
            <span className="text-2xl">{mood.emoji}</span>
            <span className="text-[10px] text-muted-foreground">{mood.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
