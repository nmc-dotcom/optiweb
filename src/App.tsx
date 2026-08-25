import { I18nProvider } from "./i18n";
import { Layout } from "./components/Layout";
import { CrawlForm } from "./components/CrawlForm";
import { ProgressBar } from "./components/ProgressBar";
import { SummaryCards } from "./components/SummaryCards";
import { ResultsTable } from "./components/ResultsTable";
import { LinkGraph } from "./components/LinkGraph";
import { ReportExport } from "./components/ReportExport";
import { BrowserCompatibility } from "./components/BrowserCompatibility";
import { useCrawlerStore } from "./features/crawler/useCrawlerStore";

function Dashboard() {
  const status = useCrawlerStore((s) => s.status);

  return (
    <>
      <CrawlForm />
      {status !== "idle" && (
        <>
          <ProgressBar />
          <SummaryCards />
          <BrowserCompatibility />
          <ReportExport />
          <LinkGraph />
          <ResultsTable />
        </>
      )}
    </>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <Layout>
        <Dashboard />
      </Layout>
    </I18nProvider>
  );
}
