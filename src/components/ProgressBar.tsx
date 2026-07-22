import { useI18n } from "../i18n";
import { useCrawlerStore } from "../features/crawler/useCrawlerStore";

export function ProgressBar() {
  const { t } = useI18n();
  const status = useCrawlerStore((s) => s.status);
  const queuedCount = useCrawlerStore((s) => s.queuedCount);
  const processedCount = useCrawlerStore((s) => s.processedCount);

  const total = processedCount + queuedCount;
  const percent =
    status === "done"
      ? 100
      : total > 0
        ? Math.min(100, Math.round((processedCount / total) * 100))
        : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {t(`status.${status}`)}
        </span>
        <span>
          {t("progress.label", {
            processed: processedCount,
            queued: queuedCount,
          })}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
