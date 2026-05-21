"use client";

import React, { useState } from "react";
import {
  Bell,
  Layout,
  Plug,
  Save,
  Loader2,
  CheckCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useSettings, useUpdateSettings } from "@/hooks/settings";
import { LoadingState } from "@/components/ui/loading";
import { cn } from "@/lib/utils";

type TabId = "notifications" | "display" | "integrations";

type TabConfig = {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const tabs: TabConfig[] = [
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "display", label: "Display", icon: Layout },
  { id: "integrations", label: "Integrations", icon: Plug },
];

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<TabId>("notifications");
  const [saved, setSaved] = useState(false);
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const isSaving = updateSettings.isPending;

  const [emailOnAnalysis, setEmailOnAnalysis] = useState(true);
  const [inAppAlerts, setInAppAlerts] = useState(true);
  const [defaultView, setDefaultView] = useState<"2d" | "3d">("2d");
  const [unitMeasurement, setUnitMeasurement] = useState<"mm" | "cm">("mm");
  const [pacsApiKey, setPacsApiKey] = useState("");
  const [pacsEndpoint, setPacsEndpoint] = useState("");

  React.useEffect(() => {
    if (settings) {
      setEmailOnAnalysis(settings.email_on_analysis);
      setInAppAlerts(settings.in_app_alerts);
      setDefaultView(
        settings.default_view === "3d"
          ? "3d"
          : settings.default_view === "2d"
          ? "2d"
          : "2d",
      );
      setUnitMeasurement(
        settings.unit_measurement === "cm"
          ? "cm"
          : "mm",
      );
      setPacsApiKey(settings.pacs_api_key ?? "");
      setPacsEndpoint(settings.pacs_endpoint ?? "");
    }
  }, [settings]);

  const handleSave = async () => {
    await updateSettings.mutateAsync({
      email_on_analysis: emailOnAnalysis,
      in_app_alerts: inAppAlerts,
      default_view: defaultView,
      unit_measurement: unitMeasurement,
      pacs_api_key: pacsApiKey || null,
      pacs_endpoint: pacsEndpoint || null,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (isLoading || !settings) {
    return (
      <LoadingState
        label="Loading settings…"
        className="h-48"
        iconClassName="h-6 w-6"
      />
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-2xl border border-ild-border bg-ild-card overflow-hidden">
        <div className="flex border-b border-ild-border">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "border-ild-accent text-ild-accent bg-ild-card-hover"
                    : "border-transparent text-muted-foreground hover:bg-ild-card-hover hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {activeTab === "notifications" && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Notification Preferences
                </h3>
                <p className="text-xs text-muted-foreground">
                  Choose how ILD-XR informs you about completed analyses and
                  system activity.
                </p>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-ild-border bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Email on Analysis Completion
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Receive an email when AI segmentation finishes
                  </p>
                </div>
                <Switch
                  checked={emailOnAnalysis}
                  onCheckedChange={setEmailOnAnalysis}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-ild-border bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    In-app System Alerts
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Show notifications in the header when analyses complete
                  </p>
                </div>
                <Switch
                  checked={inAppAlerts}
                  onCheckedChange={setInAppAlerts}
                />
              </div>
            </div>
          )}

          {activeTab === "display" && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Display Preferences
                </h3>
                <p className="text-xs text-muted-foreground">
                  Set the default viewer and units used across dashboards and
                  reports.
                </p>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">
                  Default View
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDefaultView("2d")}
                    className={cn(
                      "flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
                      defaultView === "2d"
                        ? "border-ild-accent bg-ild-accent/10 text-ild-accent"
                        : "border-ild-border bg-muted/30 text-muted-foreground hover:border-ild-border hover:bg-ild-card-hover hover:text-foreground",
                    )}
                  >
                    2D Slices
                  </button>
                  <button
                    type="button"
                    onClick={() => setDefaultView("3d")}
                    className={cn(
                      "flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
                      defaultView === "3d"
                        ? "border-ild-accent bg-ild-accent/10 text-ild-accent"
                        : "border-ild-border bg-muted/30 text-muted-foreground hover:border-ild-border hover:bg-ild-card-hover hover:text-foreground",
                    )}
                  >
                    3D Mesh
                  </button>
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">
                  Unit Measurements
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setUnitMeasurement("mm")}
                    className={cn(
                      "flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
                      unitMeasurement === "mm"
                        ? "border-ild-accent bg-ild-accent/10 text-ild-accent"
                        : "border-ild-border bg-muted/30 text-muted-foreground hover:border-ild-border hover:bg-ild-card-hover hover:text-foreground",
                    )}
                  >
                    mm³
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnitMeasurement("cm")}
                    className={cn(
                      "flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
                      unitMeasurement === "cm"
                        ? "border-ild-accent bg-ild-accent/10 text-ild-accent"
                        : "border-ild-border bg-muted/30 text-muted-foreground hover:border-ild-border hover:bg-ild-card-hover hover:text-foreground",
                    )}
                  >
                    cm³
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "integrations" && (
            <div className="space-y-6">
              <h3 className="text-sm font-semibold text-foreground">
                Hospital PACS Integration
              </h3>
              <p className="text-sm text-muted-foreground">
                Connect ILD-XR to your hospital PACS for automated study
                retrieval.
              </p>
              <div>
                <label
                  htmlFor="pacs-endpoint"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  PACS Endpoint URL
                </label>
                <Input
                  id="pacs-endpoint"
                  type="url"
                  placeholder="https://pacs.hospital.example/dicom"
                  value={pacsEndpoint}
                  onChange={(e) => setPacsEndpoint(e.target.value)}
                  className="border-ild-border bg-muted/30"
                />
              </div>
              <div>
                <label
                  htmlFor="pacs-api-key"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  API Key
                </label>
                <Input
                  id="pacs-api-key"
                  type="password"
                  placeholder="Enter your PACS API key"
                  value={pacsApiKey}
                  onChange={(e) => setPacsApiKey(e.target.value)}
                  className="border-ild-border bg-muted/30"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Keys are stored securely and never displayed in full.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-ild-border bg-ild-card px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Changes are saved to your account when you click Save.
        </p>
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="ild-cta gap-2"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isSaving ? "Saving…" : saved ? "Saved" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}

