import { useState, type FormEvent } from "react";
import { useI18n } from "../i18n";
import { useCrawlerStore } from "../features/crawler/useCrawlerStore";
import { runCrawl } from "../features/crawler/crawlEngine";
import {
  DEFAULT_CRAWL_CONFIG,
  MAX_PAGES_LIMIT,
  type CrawlConfig,
} from "../types";

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
}: NumberFieldProps) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-foreground">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      />
    </label>
  );
}

interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

function CheckboxField({
  label,
  checked,
  disabled,
  onChange,
}: CheckboxFieldProps) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input accent-primary"
      />
      {label}
    </label>
  );
}

export function CrawlForm() {
  const { t } = useI18n();
  const status = useCrawlerStore((s) => s.status);
  const isRunning = status === "running";

  const [startUrl, setStartUrl] = useState("");
  const [sameDomainOnly, setSameDomainOnly] = useState(
    DEFAULT_CRAWL_CONFIG.sameDomainOnly,
  );
  const [includeSubdomains, setIncludeSubdomains] = useState(
    DEFAULT_CRAWL_CONFIG.includeSubdomains,
  );
  const [maxPages, setMaxPages] = useState(DEFAULT_CRAWL_CONFIG.maxPages);
  const [maxDepth, setMaxDepth] = useState(DEFAULT_CRAWL_CONFIG.maxDepth);
  const [timeoutMs, setTimeoutMs] = useState(DEFAULT_CRAWL_CONFIG.timeoutMs);
  const [concurrency, setConcurrency] = useState(
    DEFAULT_CRAWL_CONFIG.concurrency,
  );
  const [respectRobotsTxt, setRespectRobotsTxt] = useState(
    DEFAULT_CRAWL_CONFIG.respectRobotsTxt,
  );
  const [excludeAuthPages, setExcludeAuthPages] = useState(
    DEFAULT_CRAWL_CONFIG.excludeAuthPages,
  );
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    let parsed: URL;
    try {
      parsed = new URL(startUrl);
    } catch {
      setError(t("form.invalidUrl"));
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      setError(t("form.invalidUrl"));
      return;
    }
    setError(null);

    const config: CrawlConfig = {
      startUrl: parsed.toString(),
      sameDomainOnly,
      includeSubdomains,
      maxPages: Math.min(Math.max(1, maxPages), MAX_PAGES_LIMIT),
      maxDepth: Math.max(0, maxDepth),
      timeoutMs: Math.max(1000, timeoutMs),
      concurrency: Math.min(Math.max(1, concurrency), 10),
      respectRobotsTxt,
      excludeAuthPages,
    };

    void runCrawl(config).catch(() => {
      useCrawlerStore.getState().setStatus("error");
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm"
    >
      <div>
        <label
          htmlFor="startUrl"
          className="mb-1 block text-sm font-medium text-foreground"
        >
          {t("form.startUrl")}
        </label>
        <input
          id="startUrl"
          type="url"
          required
          value={startUrl}
          onChange={(e) => setStartUrl(e.target.value)}
          placeholder={t("form.startUrl.placeholder")}
          disabled={isRunning}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <NumberField
          label={t("form.maxPages")}
          value={maxPages}
          min={1}
          max={MAX_PAGES_LIMIT}
          disabled={isRunning}
          onChange={setMaxPages}
        />
        <NumberField
          label={t("form.maxDepth")}
          value={maxDepth}
          min={0}
          max={10}
          disabled={isRunning}
          onChange={setMaxDepth}
        />
        <NumberField
          label={t("form.timeoutMs")}
          value={timeoutMs}
          min={1000}
          max={60000}
          step={1000}
          disabled={isRunning}
          onChange={setTimeoutMs}
        />
        <NumberField
          label={t("form.concurrency")}
          value={concurrency}
          min={1}
          max={10}
          disabled={isRunning}
          onChange={setConcurrency}
        />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <CheckboxField
          label={t("form.sameDomainOnly")}
          checked={sameDomainOnly}
          disabled={isRunning}
          onChange={setSameDomainOnly}
        />
        <CheckboxField
          label={t("form.includeSubdomains")}
          checked={includeSubdomains}
          disabled={isRunning}
          onChange={setIncludeSubdomains}
        />
        <CheckboxField
          label={t("form.respectRobotsTxt")}
          checked={respectRobotsTxt}
          disabled={isRunning}
          onChange={setRespectRobotsTxt}
        />
        <CheckboxField
          label={t("form.excludeAuthPages")}
          checked={excludeAuthPages}
          disabled={isRunning}
          onChange={setExcludeAuthPages}
        />
      </div>

      <button
        type="submit"
        disabled={isRunning}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition hover:bg-green-deep disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t("form.start")}
      </button>
    </form>
  );
}
