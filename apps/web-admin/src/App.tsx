import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AccountsPage } from "./pages/AccountsPage";
import { CrawlDataPage } from "./pages/CrawlDataPage";
import { FacebookCampaignsPage } from "./pages/FacebookCampaignsPage";
import { FacebookCampaignDetailPage } from "./pages/FacebookCampaignDetailPage";
import { ContentsPage } from "./pages/ContentsPage";
import { ContentDetailPage } from "./pages/ContentDetailPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ImportPage } from "./pages/ImportPage";
import { LoginPage } from "./pages/LoginPage";
import { SchedulesPage } from "./pages/SchedulesPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/contents" element={<ContentsPage />} />
        <Route path="/contents/:code" element={<ContentDetailPage />} />
        <Route path="/contents/:code/edit" element={<ContentDetailPage editMode />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/crawl" element={<CrawlDataPage />} />
        <Route path="/facebook/campaigns" element={<FacebookCampaignsPage />} />
        <Route path="/facebook/campaigns/:id" element={<FacebookCampaignDetailPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/schedules" element={<SchedulesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
