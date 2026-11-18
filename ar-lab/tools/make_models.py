"""
glTF (.glb) модельдерін кодпен жасау: ұшатын тәрелке (НЛО) және балық.
Сыртқы кітапханасыз шағын GLB-жазғыш (тек numpy).

Іске қосу (ar-lab қалтасынан):  python tools/make_models.py .
Нәтиже:     ar-lab/models/ufo.glb, ar-lab/models/fish.glb
"""
import json
import math
import os
import struct
import sys

import numpy as np


class GLB:
    """Ең қарапайым glTF 2.0 бинарлы файл құрастырушы."""

    def __init__(self):
        self.bin = bytearray()
        self.views, self.accessors, self.meshes, self.materials, self.nodes = [], [], [], [], []
        self.mat_index = {}

    def _view(self, data, target):
        while len(self.bin) % 4:
            self.bin.append(0)
        self.views.append({"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data), "target": target})
        self.bin.extend(data)
        return len(self.views) - 1

    def _accessor(self, arr, minmax=False):
        arr = np.ascontiguousarray(arr, np.float32)
        acc = {"bufferView": self._view(arr.tobytes(), 34962), "componentType": 5126,
               "count": len(arr), "type": "VEC3"}
        if minmax:
            acc["min"], acc["max"] = arr.min(0).tolist(), arr.max(0).tolist()
        self.accessors.append(acc)
        return len(self.accessors) - 1

    def material(self, name, color, metallic=0.0, roughness=0.6, emissive=(0, 0, 0), alpha=1.0, double=False):
        m = {"name": name,
             "pbrMetallicRoughness": {"baseColorFactor": [*color, alpha],
                                      "metallicFactor": metallic, "roughnessFactor": roughness},
             "emissiveFactor": list(emissive)}
        if alpha < 1:
            m["alphaMode"] = "BLEND"
        if double:
            m["doubleSided"] = True
        self.mat_index[name] = len(self.materials)
        self.materials.append(m)

    def mesh(self, name, tris, material, smooth=True):
        tris = np.asarray(tris, np.float64).reshape(-1, 3, 3)
        fn = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
        keep = np.linalg.norm(fn, axis=1) > 1e-12          # нүктеге айналған үшбұрыштарды алып тастау
        tris, fn = tris[keep], fn[keep]
        pos = tris.reshape(-1, 3)
        if smooth:  # бірдей нүктелердегі нормальдарды орташалау
            keys = [tuple(k) for k in np.round(pos, 5)]
            acc = {}
            for k, n in zip(keys, np.repeat(fn, 3, axis=0)):
                acc[k] = acc.get(k, 0) + n
            nor = np.array([acc[k] for k in keys])
        else:
            nor = np.repeat(fn, 3, axis=0)
        nor /= np.linalg.norm(nor, axis=1, keepdims=True) + 1e-12
        prim = {"attributes": {"POSITION": self._accessor(pos, True), "NORMAL": self._accessor(nor)},
                "material": self.mat_index[material]}
        self.meshes.append({"name": name, "primitives": [prim]})
        self.nodes.append({"name": name, "mesh": len(self.meshes) - 1})

    def save(self, path):
        gltf = {"asset": {"version": "2.0", "generator": "ar-lab make_models.py"},
                "scene": 0, "scenes": [{"nodes": list(range(len(self.nodes)))}],
                "nodes": self.nodes, "meshes": self.meshes, "materials": self.materials,
                "accessors": self.accessors, "bufferViews": self.views,
                "buffers": [{"byteLength": len(self.bin)}]}
        js = json.dumps(gltf, separators=(",", ":")).encode()
        js += b" " * (-len(js) % 4)
        bn = bytes(self.bin) + b"\0" * (-len(self.bin) % 4)
        total = 12 + 8 + len(js) + 8 + len(bn)
        with open(path, "wb") as f:
            f.write(struct.pack("<III", 0x46546C67, 2, total))
            f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
            f.write(struct.pack("<II", len(bn), 0x004E4942) + bn)


# ---------- Геометрия ----------

def lathe(profile, seg=32):
    """Профильді (r, y) Y осі бойымен айналдыру. Профиль төменнен жоғары жүруі керек."""
    tris = []
    for i in range(seg):
        a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
        P = lambda r, y, a: (r * math.sin(a), y, r * math.cos(a))
        for (r0, y0), (r1, y1) in zip(profile, profile[1:]):
            p00, p01, p11, p10 = P(r0, y0, a0), P(r0, y0, a1), P(r1, y1, a1), P(r1, y1, a0)
            tris += [(p00, p01, p11), (p00, p11, p10)]
    return np.array(tris)


def sphere(radius, center=(0, 0, 0), seg=20, rings=12):
    prof = [(radius * math.sin(math.pi * k / rings), -radius * math.cos(math.pi * k / rings)) for k in range(rings + 1)]
    return lathe(prof, seg) + np.array(center)


def move(tris, dx=0, dy=0, dz=0):
    return tris + np.array([dx, dy, dz])


# ---------- Модельдер ----------

def make_ufo(path):
    g = GLB()
    g.material("hull", (0.78, 0.80, 0.88), metallic=0.35, roughness=0.35)
    g.material("glass", (0.55, 0.90, 1.00), roughness=0.1, emissive=(0.05, 0.18, 0.25), alpha=0.45)
    g.material("alien", (0.45, 0.92, 0.35), roughness=0.5, emissive=(0.08, 0.2, 0.05))
    g.material("eye", (0.02, 0.02, 0.03), roughness=0.2)
    g.material("lights", (1.0, 0.85, 0.3), emissive=(1.0, 0.75, 0.2))
    g.material("emitter", (0.3, 1.0, 1.0), emissive=(0.3, 1.0, 1.0))

    hull = [(0, 0.0), (0.18, 0.0), (0.36, 0.03), (0.50, 0.08), (0.54, 0.11),
            (0.50, 0.14), (0.36, 0.18), (0.21, 0.205), (0, 0.205)]
    g.mesh("hull", lathe(hull, 40), "hull")
    dome = [(0.2 * math.cos(t), 0.2 + 0.2 * math.sin(t)) for t in np.linspace(0, math.pi / 2, 10)]
    g.mesh("dome", lathe(dome, 32), "glass")
    g.mesh("alien_head", sphere(0.075, (0, 0.285, 0)), "alien")
    g.mesh("alien_eyes", np.concatenate([sphere(0.022, (x, 0.3, 0.06), 12, 8) for x in (-0.03, 0.03)]), "eye")
    lights = [sphere(0.032, (0.53 * math.sin(a), 0.11, 0.53 * math.cos(a)), 12, 8)
              for a in np.linspace(0, 2 * math.pi, 10, endpoint=False)]
    g.mesh("lights", np.concatenate(lights), "lights")
    g.mesh("emitter", lathe([(0, -0.012), (0.14, -0.012), (0.14, 0.0)], 32), "emitter", smooth=False)
    g.save(path)


def make_fish(path):
    g = GLB()
    g.material("body", (1.0, 0.55, 0.2), roughness=0.45)
    g.material("fin", (1.0, 0.82, 0.35), roughness=0.5, double=True)
    g.material("eye_white", (0.97, 0.97, 0.97), roughness=0.3)
    g.material("pupil", (0.02, 0.02, 0.03), roughness=0.2)

    prof = [(0, 0), (0.03, 0.02), (0.07, 0.08), (0.12, 0.2), (0.14, 0.3),
            (0.13, 0.38), (0.09, 0.45), (0.04, 0.49), (0, 0.5)]
    body = lathe(prof, 24)
    # Y осін X осіне бұру (бас +X жақта), бүйірден жаныштап, ортаға жылжыту
    body = np.stack([body[..., 1] - 0.25, -body[..., 0], body[..., 2] * 0.6], -1)
    g.mesh("body", body, "body")

    t = -0.25  # құйрық нүктесі
    tail = [((t + 0.02, 0, 0), (t - 0.15, 0.13, 0), (t - 0.10, 0, 0)),
            ((t + 0.02, 0, 0), (t - 0.10, 0, 0), (t - 0.15, -0.13, 0))]
    dorsal = [((0.06, 0.12, 0), (-0.12, 0.10, 0), (-0.07, 0.21, 0))]
    g.mesh("fins", np.array(tail + dorsal), "fin", smooth=False)

    eyes_w = np.concatenate([sphere(0.03, (0.15, 0.03, z), 12, 8) for z in (-0.06, 0.06)])
    pupils = np.concatenate([sphere(0.017, (0.165, 0.03, z), 10, 6) for z in (-0.082, 0.082)])
    g.mesh("eye_white", eyes_w, "eye_white")
    g.mesh("pupil", pupils, "pupil")
    g.save(path)


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "ar-lab"
    out = os.path.join(root, "models")
    os.makedirs(out, exist_ok=True)
    make_ufo(os.path.join(out, "ufo.glb"))
    make_fish(os.path.join(out, "fish.glb"))
    for n in ("ufo.glb", "fish.glb"):
        print(n, os.path.getsize(os.path.join(out, n)), "bytes")


if __name__ == "__main__":
    main()
