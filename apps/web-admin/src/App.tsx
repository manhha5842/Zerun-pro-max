import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AccountSessionsPage } from "./pages/AccountSessionsPage";
import { AutoConversionHistoryPage, AutoConversionRulesPage } from "./pages/AutoConversionPages";
import { SavedContentsPage, TrashPage } from "./pages/ContentCollectionsPage";
import { ContentsPage } from "./pages/ContentsPage";
import { CrawlHistoryPage, CrawlJobsPage, CrawlResultsPage } from "./pages/CrawlPages";
import { ContentDetailPage } from "./pages/ContentDetailPage";
import { DashboardPage } from "./pages/DashboardPage";
import { HistoryPage } from "./pages/HistoryPage";
import { PostComposerPage } from "./pages/PostComposerPage";
import { QuickConvertLinkPage } from "./pages/QuickConvertLinkPage";
import { RepostFlowPage } from "./pages/RepostFlowPage";
import { RepostHistoryPage } from "./pages/RepostHistoryPage";
import { RepostManualLinksPage } from "./pages/RepostManualLinksPage";
import { RepostReviewQueuePage } from "./pages/RepostReviewQueuePage";
import { AiSettingsPage, AffiliateSettingsPage, AutoPublishSettingsPage, TelegramAlertSettingsPage } from "./pages/SetupSettingsPages";
import { SettingsPage } from "./pages/SettingsPage";
import { AccountsPage } from "./pages/AccountsPage";
import { WorkerJobsPage } from "./pages/WorkerJobsPage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/repost/flow" element={<RepostFlowPage />} />
        <Route path="/repost/review" element={<RepostReviewQueuePage />} />
        <Route path="/repost/manual-links" element={<RepostManualLinksPage />} />
        <Route path="/repost/history" element={<RepostHistoryPage />} />
        <Route path="/contents/new" element={<PostComposerPage />} />
        <Route path="/contents" element={<ContentsPage />} />
        <Route path="/contents/archive" element={<SavedContentsPage />} />
        <Route path="/contents/saved" element={<Navigate to="/contents/archive" replace />} />
        <Route path="/contents/trash" element={<TrashPage />} />
        <Route path="/contents/:code" element={<Navigate to="/contents" replace />} />
        <Route path="/contents/:code/edit" element={<ContentDetailPage />} />
        <Route path="/schedules" element={<Navigate to="/contents" replace />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/pending-comments" element={<Navigate to="/contents" replace />} />
        <Route path="/auto-conversion/rules" element={<AutoConversionRulesPage />} />
        <Route path="/auto-conversion/history" element={<AutoConversionHistoryPage />} />
        <Route path="/crawl" element={<CrawlJobsPage />} />
        <Route path="/crawl/history" element={<CrawlHistoryPage />} />
        <Route path="/crawl/results" element={<CrawlResultsPage />} />
        <Route path="/tools/convert-link" element={<QuickConvertLinkPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/accounts/sessions" element={<AccountSessionsPage />} />
        <Route path="/settings" element={<Navigate to="/settings/ai" replace />} />
        <Route path="/settings/ai" element={<AiSettingsPage />} />
        <Route path="/settings/affiliate" element={<AffiliateSettingsPage />} />
        <Route path="/settings/telegram-alert" element={<TelegramAlertSettingsPage />} />
        <Route path="/settings/auto-publish" element={<AutoPublishSettingsPage />} />
        <Route path="/settings/legacy" element={<SettingsPage />} />
        <Route path="/worker-jobs" element={<WorkerJobsPage />} />
        <Route path="/import" element={<Navigate to="/contents/new" replace />} />
        <Route path="/failed" element={<Navigate to="/contents/archive" replace />} />
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
