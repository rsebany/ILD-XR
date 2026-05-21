import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export function XRInteractionLayer() {
  const { gl, scene, camera } = useThree();

  const raycasterRef = useRef(new THREE.Raycaster());
  const grabbedRef = useRef<THREE.Object3D | null>(null);
  const grabControllerRef = useRef<THREE.Object3D | null>(null);
  const grabOffsetRef = useRef(new THREE.Matrix4());
  const lockedRotationRef = useRef(new THREE.Quaternion());
  const lockedScaleRef = useRef(new THREE.Vector3());
  const controllersRef = useRef<THREE.Object3D[]>([]);

  const makeLaser = (controller: THREE.Object3D) => {
    const existing = controller.getObjectByName("xr-laser");
    if (existing) return;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    const material = new THREE.LineBasicMaterial({ color: 0xffffff });
    const line = new THREE.Line(geometry, material);
    line.name = "xr-laser";
    line.scale.z = 2;
    controller.add(line);
  };

  const getControllerHit = (controller: THREE.Object3D) => {
    const raycaster = raycasterRef.current;

    const tempMatrix = new THREE.Matrix4().identity().extractRotation(controller.matrixWorld);
    const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
    const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);

    raycaster.set(origin, direction);
    // Required for LineSegments2 raycast internals (uses camera near/far).
    raycaster.camera = camera;

    const grabbables: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      if (obj.userData && obj.userData.grabbable) {
        grabbables.push(obj);
      }
    });

    if (grabbables.length === 0) return null;

    const intersects = raycaster.intersectObjects(grabbables, true);
    if (intersects.length === 0) return null;

    let obj: THREE.Object3D | null = intersects[0].object;
    while (obj && !obj.userData?.grabbable) {
      obj = obj.parent;
    }
    return obj;
  };

  useEffect(() => {
    const renderer = gl;
    const controller1 = renderer.xr.getController(0);
    const controller2 = renderer.xr.getController(1);

    makeLaser(controller1);
    makeLaser(controller2);

    scene.add(controller1);
    scene.add(controller2);

    controllersRef.current = [controller1, controller2];

    const onSelectStart = (event: any) => {
      if (grabbedRef.current) return;
      const ctrl = event.target as THREE.Object3D;
      const hit = getControllerHit(ctrl);
      if (!hit) return;

      grabbedRef.current = hit;
      grabControllerRef.current = ctrl;
      lockedRotationRef.current.copy(hit.quaternion);
      lockedScaleRef.current.copy(hit.scale);

      const inv = new THREE.Matrix4().copy(ctrl.matrixWorld).invert();
      grabOffsetRef.current.copy(inv.multiply(hit.matrixWorld));
    };

    const onSelectEnd = (event: any) => {
      const ctrl = event.target as THREE.Object3D;
      if (ctrl !== grabControllerRef.current) return;
      grabbedRef.current = null;
      grabControllerRef.current = null;
    };

    controller1.addEventListener("selectstart", onSelectStart);
    controller1.addEventListener("selectend", onSelectEnd);
    controller2.addEventListener("selectstart", onSelectStart);
    controller2.addEventListener("selectend", onSelectEnd);

    return () => {
      controller1.removeEventListener("selectstart", onSelectStart);
      controller1.removeEventListener("selectend", onSelectEnd);
      controller2.removeEventListener("selectstart", onSelectStart);
      controller2.removeEventListener("selectend", onSelectEnd);
      scene.remove(controller1);
      scene.remove(controller2);
      controllersRef.current = [];
    };
  }, [gl, scene]);

  useFrame(() => {
    const grabbed = grabbedRef.current;
    const grabController = grabControllerRef.current;
    if (!grabbed || !grabController) return;

    const m = new THREE.Matrix4()
      .copy(grabController.matrixWorld)
      .multiply(grabOffsetRef.current);

    const nextPos = new THREE.Vector3();
    m.decompose(nextPos, new THREE.Quaternion(), new THREE.Vector3());
    grabbed.position.copy(nextPos);
    grabbed.quaternion.copy(lockedRotationRef.current);
    grabbed.scale.copy(lockedScaleRef.current);
  });

  return null;
}

