import { useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Optimizer } from "./pages/Optimizer";
import { Batch } from "./pages/Batch";
import { Profiles } from "./pages/Profiles";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";
import { useSettingsStore } from "./stores/settingsStore";
import { useMarketplaceStore } from "./stores/marketplaceStore";
import { usePresetStore } from "./stores/presetStore";

export function App() {
  const loadSettings = useSettingsStore((s) => s.load);
  const loadMarketplaces = useMarketplaceStore((s) => s.load);
  const loadPresets = usePresetStore((s) => s.load);

  useEffect(() => {
    void loadSettings();
    void loadMarketplaces();
    void loadPresets();
  }, [loadSettings, loadMarketplaces, loadPresets]);

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="optimizer" element={<Optimizer />} />
          <Route path="batch" element={<Batch />} />
          <Route path="profiles" element={<Profiles />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
