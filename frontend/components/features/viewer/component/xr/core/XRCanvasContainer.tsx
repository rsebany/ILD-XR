import React from "react";
import { Canvas } from "@react-three/fiber";

type XRCanvasContainerProps = {
  children: React.ReactNode;
  backgroundColor?: string;
};

export function XRCanvasContainer({
  children,
  backgroundColor = "#020617",
}: XRCanvasContainerProps) {
  return (
    <div className="relative h-full w-full rounded-xl bg-slate-900/60">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        gl={{ 
          antialias: true,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance"
        }}
        className="rounded-xl"
        orthographic={false}
        onCreated={({ gl }) => {
          // Handle context loss
          gl.domElement.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            console.warn('WebGL context lost, attempting to restore...');
          });
          gl.domElement.addEventListener('webglcontextrestored', () => {
            console.log('WebGL context restored');
          });
        }}
      >
        <color attach="background" args={[backgroundColor]} />
        {children}
      </Canvas>
    </div>
  );
}

