import {
  VOLUME_DISPLAY_LABELS,
  VOLUME_DISPLAY_UNITS,
} from "@/lib/metrics/volume-display-unit";
import { cn } from "@/lib/utils";
import type { DisplaySettingsState } from "./settings-tab-types";

type DisplaySettingsTabProps = DisplaySettingsState;

export function DisplaySettingsTab({
  defaultView,
  volumeUnit,
  setDefaultView,
  setVolumeUnit,
}: DisplaySettingsTabProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">Display Preferences</h3>
        <p className="text-xs text-muted-foreground">
          Set the default viewer and how segmentation volumes appear on
          dashboards, viewers, and XR.
        </p>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Default View</p>
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
          Segmentation volume units
        </p>
        <p className="mb-3 text-xs text-muted-foreground">
          Applies to ILD totals, lesion class volumes, and lung volume. Zonal
          distribution stays in percent of ILD per zone.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {VOLUME_DISPLAY_UNITS.map((unit) => (
            <button
              key={unit}
              type="button"
              onClick={() => setVolumeUnit(unit)}
              className={cn(
                "rounded-lg border px-3 py-3 text-sm font-medium transition-colors",
                volumeUnit === unit
                  ? "border-ild-accent bg-ild-accent/10 text-ild-accent"
                  : "border-ild-border bg-muted/30 text-muted-foreground hover:border-ild-border hover:bg-ild-card-hover hover:text-foreground",
              )}
            >
              {VOLUME_DISPLAY_LABELS[unit]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
