import { differenceInCalendarDays } from "date-fns";
import { PHASE_LABELS, type PhaseWindow } from "@/lib/plan/engine";
import type { Phase } from "@/types/database";

const PHASE_BAR_CLASS: Record<Phase, string> = {
  basic: "bg-phase-basic",
  advance: "bg-phase-advance",
  final: "bg-phase-final",
};

function formatShort(date: string) {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** 今日から試験日までのフェーズ帯を横棒で表示する */
export function PhaseTimeline({
  windows,
  today,
}: {
  windows: PhaseWindow[];
  today: string;
}) {
  if (windows.length === 0) return null;

  const start = new Date(`${windows[0].start}T00:00:00`);
  const end = new Date(`${windows[windows.length - 1].end}T00:00:00`);
  const totalDays = differenceInCalendarDays(end, start) + 1;
  const elapsed = Math.max(
    0,
    differenceInCalendarDays(new Date(`${today}T00:00:00`), start),
  );
  const todayPct = Math.min(100, (elapsed / totalDays) * 100);

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="flex h-6 overflow-hidden rounded-full">
          {windows.map((w) => {
            const days =
              differenceInCalendarDays(
                new Date(`${w.end}T00:00:00`),
                new Date(`${w.start}T00:00:00`),
              ) + 1;
            return (
              <div
                key={w.phase}
                className={`${PHASE_BAR_CLASS[w.phase]} flex items-center justify-center text-[10px] font-medium text-white`}
                style={{ width: `${(days / totalDays) * 100}%` }}
                title={`${PHASE_LABELS[w.phase]}: ${w.start}〜${w.end}`}
              >
                <span className="hidden truncate px-1 sm:inline">
                  {PHASE_LABELS[w.phase]}
                </span>
              </div>
            );
          })}
        </div>
        <div
          className="absolute -top-1 h-8 w-0.5 bg-foreground"
          style={{ left: `${todayPct}%` }}
          aria-label="今日"
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatShort(windows[0].start)}</span>
        <span className="font-medium text-foreground">▲ 今日</span>
        <span>{formatShort(windows[windows.length - 1].end)} 試験前日</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground sm:hidden">
        {windows.map((w) => (
          <span key={w.phase} className="flex items-center gap-1">
            <span
              className={`${PHASE_BAR_CLASS[w.phase]} inline-block size-2.5 rounded-full`}
            />
            {PHASE_LABELS[w.phase]} {formatShort(w.start)}〜
          </span>
        ))}
      </div>
    </div>
  );
}
