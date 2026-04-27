import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AccountsPage } from "./pages/AccountsPage";
import { AutoConversionHistoryPage, AutoConversionRulesPage } from "./pages/AutoConversionPages";
import { SavedContentsPage, TrashPage } from "./pages/ContentCollectionsPage";
import { ContentsPage } from "./pages/ContentsPage";
import { ConvertLinkToolPage } from "./pages/ConvertLinkToolPage";
import { CrawlHistoryPage, CrawlJobsPage, CrawlResultsPage } from "./pages/CrawlPages";
import { DashboardPage } from "./pages/DashboardPage";
import { HistoryPage } from "./pages/HistoryPage";
import { PostComposerPage } from "./pages/PostComposerPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkerJobsPage } from "./pages/WorkerJobsPage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/contents/new" element={<PostComposerPage />} />
        <Route path="/contents" element={<ContentsPage />} />
        <Route path="/contents/archive" element={<SavedContentsPage />} />
        <Route path="/contents/saved" element={<Navigate to="/contents/archive" replace />} />
        <Route path="/contents/trash" element={<TrashPage />} />
        <Route path="/contents/:code" element={<Navigate to="/contents" replace />} />
        <Route path="/contents/:code/edit" element={<Navigate to="/contents" replace />} />
        <Route path="/schedules" element={<Navigate to="/contents" replace />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/pending-comments" element={<Navigate to="/contents" replace />} />
        <Route path="/auto-conversion/rules" element={<AutoConversionRulesPage />} />
        <Route path="/auto-conversion/history" element={<AutoConversionHistoryPage />} />
        <Route path="/crawl" element={<CrawlJobsPage />} />
        <Route path="/crawl/history" element={<CrawlHistoryPage />} />
        <Route path="/crawl/results" element={<CrawlResultsPage />} />
        <Route path="/tools/convert-link" element={<ConvertLinkToolPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/accounts/sessions" element={<Navigate to="/accounts" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/worker-jobs" element={<WorkerJobsPage />} />
        <Route path="/import" element={<Navigate to="/contents/new" replace />} />
        <Route path="/failed" element={<Navigate to="/contents/archive" replace />} />
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
