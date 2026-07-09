"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updatePlanSettings } from "@/lib/actions/masters";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlanSettings } from "@/types/database";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export function PlanSettingsForm({ settings }: { settings: PlanSettings }) {
  const [pending, startTransition] = useTransition();

  const onSubmit = (formData: FormData) => {
    startTransition(async () => {
      const res = await updatePlanSettings(formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("設定を保存しました。プランの再生成で反映されます。");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>学習時間・フェーズ配分</CardTitle>
        <CardDescription>
          曜日ごとの学習可能時間に応じてタスク量が配分されます
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="space-y-6">
          <div>
            <p className="mb-2 text-sm font-medium">曜日別の学習可能時間(分)</p>
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
              {WEEKDAY_LABELS.map((label, dow) => (
                <div key={dow} className="space-y-1">
                  <Label
                    htmlFor={`weekday-${dow}`}
                    className={
                      dow === 0
                        ? "text-destructive"
                        : dow === 6
                          ? "text-phase-basic"
                          : undefined
                    }
                  >
                    {label}
                  </Label>
                  <Input
                    id={`weekday-${dow}`}
                    name={`weekday_${dow}`}
                    type="number"
                    min={0}
                    max={1440}
                    defaultValue={settings.weekday_minutes[String(dow)] ?? 0}
                    required
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">年間フェーズの配分(%)</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="basic-pct" className="text-phase-basic">
                  基礎固め
                </Label>
                <Input
                  id="basic-pct"
                  name="basic_pct"
                  type="number"
                  min={1}
                  max={98}
                  defaultValue={Math.round(settings.basic_ratio * 100)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="advance-pct" className="text-phase-advance">
                  発展
                </Label>
                <Input
                  id="advance-pct"
                  name="advance_pct"
                  type="number"
                  min={1}
                  max={98}
                  defaultValue={Math.round(settings.advance_ratio * 100)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-phase-final">直前対策</Label>
                <p className="flex h-9 items-center text-sm text-muted-foreground">
                  残り(自動)
                </p>
              </div>
            </div>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "保存中..." : "保存する"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
