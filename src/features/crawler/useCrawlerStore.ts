import { create } from "zustand";
import type {
  CrawlConfig,
  CrawlStatus,
  CrawlSummary,
  LinkResult,
  PageResult,
} from "../../types";

interface CrawlerState {
  status: CrawlStatus;
  config: CrawlConfig | null;
  pageResults: PageResult[];
  linkResults: LinkResult[];
  queuedCount: number;
  processedCount: number;
  summary: CrawlSummary;
  setStatus: (status: CrawlStatus) => void;
  setConfig: (config: CrawlConfig) => void;
  addPageResult: (result: PageResult) => void;
  addLinkResult: (result: LinkResult) => void;
  setProgress: (queuedCount: number, processedCount: number) => void;
  reset: () => void;
}

const EMPTY_SUMMARY: CrawlSummary = {
  pagesScanned: 0,
  brokenLinks: 0,
  redirects: 0,
  brokenImages: 0,
  a11yIssues: 0,
  standardsIssues: 0,
};

export const useCrawlerStore = create<CrawlerState>((set) => ({
  status: "idle",
  config: null,
  pageResults: [],
  linkResults: [],
  queuedCount: 0,
  processedCount: 0,
  summary: EMPTY_SUMMARY,

  setStatus: (status) => set({ status }),
  setConfig: (config) => set({ config }),

  addPageResult: (result) =>
    set((state) => {
      const pageResults = [...state.pageResults, result];
      const summary = { ...state.summary, pagesScanned: pageResults.length };
      if (result.redirectChain.length > 0) summary.redirects += 1;
      return { pageResults, summary };
    }),

  addLinkResult: (result) =>
    set((state) => {
      const linkResults = [...state.linkResults, result];
      const summary = { ...state.summary };
      if (result.isBroken && result.resourceType === "page")
        summary.brokenLinks += 1;
      if (result.isBroken && result.resourceType === "image")
        summary.brokenImages += 1;
      if (result.redirectChain.length > 0) summary.redirects += 1;
      return { linkResults, summary };
    }),

  setProgress: (queuedCount, processedCount) =>
    set({ queuedCount, processedCount }),

  reset: () =>
    set({
      status: "idle",
      pageResults: [],
      linkResults: [],
      queuedCount: 0,
      processedCount: 0,
      summary: EMPTY_SUMMARY,
    }),
}));
