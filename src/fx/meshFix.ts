// Phaser 3.80 Mesh bug: when the WebGL batch fills up in the middle of a mesh,
// MeshWebGLRenderer flushes and restarts writing at offset 0 instead of -1
// (Vertex.load pre-increments), so every vertex after the flush is shifted by
// one float and the rest of the mesh vanishes for that frame. The puppet's body
// is a mesh, so it blinked out at random. Fix: flush *before* the mesh whenever
// it would not fit in what is left of the batch, so the buggy path never runs.

import Phaser from 'phaser';

type Renderer = { pipelines: { set: (p: unknown, go: unknown) => Pipeline | null } };
type Pipeline = { vertexCount: number; vertexCapacity: number; flush: () => void };
type MeshLike = { pipeline: unknown; faces: unknown[] };
type RenderFn = (renderer: Renderer, src: MeshLike, camera: unknown, parentMatrix: unknown) => void;

export function patchMeshRenderer(): void {
  const proto = Phaser.GameObjects.Mesh.prototype as unknown as { renderWebGL: RenderFn; __meshFix?: boolean };
  if (proto.__meshFix) return;
  const original = proto.renderWebGL;
  proto.renderWebGL = function (renderer, src, camera, parentMatrix) {
    const pipeline = renderer.pipelines.set(src.pipeline, src);
    if (pipeline && pipeline.vertexCount + src.faces.length * 3 >= pipeline.vertexCapacity) pipeline.flush();
    original.call(this, renderer, src, camera, parentMatrix);
  };
  proto.__meshFix = true;
}
