import { create } from "zustand";
import type {
  CrawlConfig,
  CrawlStatus,
  CrawlSummary,
  LinkResult,
  PageResult,
} from "../../types";
import {
  createEmptySiteIndex,
  type Issue,
  type SiteIndex,
} from "../rules/types";
import { createCookieJar, type CookieJar } from "../../lib/cookieJar";

export interface RuleIssueEntry {
  pageUrl: string;
  issue: Issue;
}

interface CrawlerState {
  status: CrawlStatus;
  config: CrawlConfig | null;
  pageResults: PageResult[];
  linkResults: LinkResult[];
  ruleIssues: RuleIssueEntry[];
  siteIndex: SiteIndex;
  /** SSO auto-follow's cookie jar — one stable instance per store, cleared on reset() and
   * again by crawlEngine when a crawl finishes. Not part of reactive state: nothing needs to
   * re-render off its contents, only the derived PageResult.sso* fields do. */
  cookieJar: CookieJar;
  queuedCount: number;
  processedCount: number;
  summary: CrawlSummary;
  setStatus: (status: CrawlStatus) => void;
  setConfig: (config: CrawlConfig) => void;
  addPageResult: (result: PageResult) => void;
  addLinkResult: (result: LinkResult) => void;
  addRuleIssues: (pageUrl: string, issues: Issue[]) => void;
  updateSiteIndex: (
    pageUrl: string,
    title: string | null,
    description: string | null,
  ) => void;
  setProgress: (queuedCount: number, processedCount: number) => void;
  reset: () => void;
}

const EMPTY_SUMMARY: CrawlSummary = {
  pagesScanned: 0,
  brokenLinks: 0,
  redirects: 0,
  brokenImages: 0,
  seoWarnings: 0,
  a11yIssues: 0,
  standardsIssues: 0,
};

export const useCrawlerStore = create<CrawlerState>((set, get) => ({
  status: "idle",
  config: null,
  pageResults: [],
  linkResults: [],
  ruleIssues: [],
  siteIndex: createEmptySiteIndex(),
  cookieJar: createCookieJar(),
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

  addRuleIssues: (pageUrl, issues) => {
    if (issues.length === 0) return;
    set((state) => {
      const ruleIssues = [
        ...state.ruleIssues,
        ...issues.map((issue) => ({ pageUrl, issue })),
      ];
      const summary = { ...state.summary };
      for (const issue of issues) {
        if (issue.category === "seo") summary.seoWarnings += 1;
        if (issue.category === "a11y") summary.a11yIssues += 1;
        if (issue.category === "standards") summary.standardsIssues += 1;
      }
      return { ruleIssues, summary };
    });
  },

  updateSiteIndex: (pageUrl, title, description) =>
    set((state) => {
      const titles = new Map(state.siteIndex.titles);
      const descriptions = new Map(state.siteIndex.descriptions);
      if (title) titles.set(title, [...(titles.get(title) ?? []), pageUrl]);
      if (description)
        descriptions.set(description, [
          ...(descriptions.get(description) ?? []),
          pageUrl,
        ]);
      return { siteIndex: { titles, descriptions } };
    }),

  setProgress: (queuedCount, processedCount) =>
    set({ queuedCount, processedCount }),

  reset: () => {
    get().cookieJar.clear();
    set({
      status: "idle",
      pageResults: [],
      linkResults: [],
      ruleIssues: [],
      siteIndex: createEmptySiteIndex(),
      queuedCount: 0,
      processedCount: 0,
      summary: EMPTY_SUMMARY,
    });
  },
}));
