type SignalMeterProps = {
  fit: number;
  intent: number;
  total: number;
  qualified: boolean;
};

/** The signature visual: one bar, fit segment + intent segment. */
export function SignalMeter({ fit, intent, total, qualified }: SignalMeterProps) {
  const fitWidth = Math.max(0, Math.min(100, fit)) * 0.4;
  const intentWidth = Math.max(0, Math.min(100, intent)) * 0.6;

  return (
    <div className="min-w-[180px]">
      <div className="bg-meter-track relative h-2.5 w-full overflow-hidden rounded-full">
        <div
          className="bg-cool absolute inset-y-0 left-0 transition-[width] duration-500"
          style={{ width: `${fitWidth}%` }}
        />
        <div
          className={`absolute inset-y-0 transition-[width] duration-500 ${qualified ? "bg-hot" : "bg-cool/60"}`}
          style={{ left: `${fitWidth}%`, width: `${intentWidth}%` }}
        />
      </div>
      <div className="text-muted-foreground mt-1.5 flex items-center gap-3 font-mono text-[11px] tracking-tight">
        <span>
          fit <span className="text-foreground">{fit}</span>
        </span>
        <span>
          intent <span className="text-foreground">{intent}</span>
        </span>
        <span className={qualified ? "text-hot" : "text-muted-foreground"}>
          total <span className="font-semibold">{total}</span>
        </span>
      </div>
    </div>
  );
}
