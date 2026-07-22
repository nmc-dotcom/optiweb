import type { ReactNode } from "react";
import { useI18n } from "../i18n";

export function Layout({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useI18n();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-green-deep sm:text-3xl">
            {t("app.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("app.subtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLocale(locale === "ko" ? "en" : "ko")}
          className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
        >
          {locale === "ko" ? "EN" : "한국어"}
        </button>
      </header>
      <main className="space-y-6">{children}</main>
    </div>
  );
}
