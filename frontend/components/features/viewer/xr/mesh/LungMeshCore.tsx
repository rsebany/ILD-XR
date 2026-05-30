import type { LungMeshCoreProps } from "./lung-mesh.types";
import { LungMeshGltf } from "./lung-mesh-gltf";
import { LungMeshPlaceholder } from "./lung-mesh-placeholder";

export type { LungMeshCoreProps } from "./lung-mesh.types";

export function LungMeshCore(props: LungMeshCoreProps) {
  if (props.usePlaceholder) {
    return (
      <LungMeshPlaceholder
        realLungEnabled={props.realLungEnabled}
        onWorldDragDelta={props.onWorldDragDelta}
        autoRotate={props.autoRotate}
        allowDrag={props.allowDrag}
        layoutGroupPosition={props.layoutGroupPosition}
      />
    );
  }
  return (
    <LungMeshGltf
      meshUrl={props.meshUrl}
      realLungEnabled={props.realLungEnabled}
      classVisibility={props.classVisibility}
      onWorldDragDelta={props.onWorldDragDelta}
      autoRotate={props.autoRotate}
      allowDrag={props.allowDrag}
      layoutGroupPosition={props.layoutGroupPosition}
      surfacePickMode={props.surfacePickMode}
      onSurfacePick={props.onSurfacePick}
    />
  );
}
