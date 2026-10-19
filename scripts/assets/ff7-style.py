# Versão "FF7 de PS1" de um boneco KayKit: menos polígonos, cor chapada por face (a textura de gradientes vira uma paleta de
# 16×8 pixels), mãos em bloco e, com --prop batalha, cabeça menor e corpo mais comprido. Mantém os 41 ossos, os nomes das
# malhas e as 7 animações, para o jogo montar o boneco como os outros (scene.ts: assemble e makeMage).
# blender -b --factory-startup --python scripts/assets/ff7-style.py -- <entrada.glb> <saida.glb> [--prop mapa|batalha|nenhuma]
#   [--fator 0.3] [--blend saida.blend]
# mapa: proporção do KayKit (já é cabeçuda, como os bonecos de mapa do FF7); o esqueleto não muda e as peças dos outros
# bonecos continuam encaixando. batalha: mexe nos ossos; peças de outros arquivos deformam (elas trazem a pose de ligação antiga).
import bpy, bmesh, sys
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
opt = dict(zip(argv[2::2], argv[3::2]))
PROP = opt.get('--prop', 'mapa')
FATOR = float(opt.get('--fator', '0.3'))  # fração dos triângulos que fica
BLEND = opt.get('--blend')
PW, PH = 16, 8  # paleta: cada quadro de gradiente (128×256) vira 2×2 cores chapadas

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.data.materials]
# mede e deforma na pose de repouso (a que o jogo usa para medir a altura); a importação deixa uma animação aplicada
arm.data.pose_position = 'REST'
bpy.context.view_layer.update()


def height(objs):
    # como o jogo mede (three.js, Box3 sem "precise"): a caixa local de cada peça levada ao mundo
    bpy.context.view_layer.update()
    zs = [(o.matrix_world @ Vector(c)).z for o in objs for c in o.bound_box]
    return max(zs) - min(zs)


def tris(objs):
    return sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)


def apply_mod(o, mod):
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


H0 = height(meshes)
print('altura original', round(H0, 3), 'triângulos', tris(meshes))

# 1. proporção de batalha: deforma malhas e ossos com a mesma função (pose de repouso coerente; as animações guardam
# rotações relativas ao repouso, então continuam servindo)
if PROP == 'batalha':
    bones = arm.data.bones
    AW = arm.matrix_world
    hip = (AW @ bones['upperleg.l'].head_local).z
    neck = (AW @ bones['head'].head_local).z
    sx = (AW @ bones['upperarm.l'].head_local).x
    wx = (AW @ bones['wrist.l'].head_local).x
    foot = (AW @ bones['foot.l'].head_local).z
    KL, KT, KA, S = 1.5, 1.25, 1.3, 0.6  # pernas, tronco, braços, cabeça

    def warp(p, head=False):
        x, y, z = p
        if head:  # cabeça e chapéu: escala por igual a partir do pescoço
            n2 = foot + (hip - foot) * KL + (neck - hip) * KT
            return Vector((x * S, y * S, n2 + (z - neck) * S))
        # estica entre ombro e pulso e entre tornozelo e quadril; mão e pé só andam junto
        ax = abs(x)
        if ax > sx:
            x = np.sign(x) * (sx + (min(ax, wx) - sx) * KA + max(0, ax - wx))
        leg = foot + (hip - foot) * KL
        z = z if z < foot else foot + (z - foot) * KL if z < hip else leg + (z - hip) * KT
        return Vector((x, y, z))

    def deform(fn):
        # posições finais de cada vértice (no mundo), antes de mexer nos ossos
        target = {}
        for o in meshes:
            mw = o.matrix_world
            if o.parent_bone.startswith('handslot'):  # arma rígida: só acompanha a mão
                hs = AW @ arm.data.bones[o.parent_bone].head_local
                d = fn(hs) - hs
                target[o] = [mw @ v.co + d for v in o.data.vertices]
            else:
                head = o.parent_bone == 'head' or o.name.endswith('_Head')
                target[o] = [fn(mw @ v.co, head) for v in o.data.vertices]
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode='EDIT')
        inv = AW.inverted()
        for eb in arm.data.edit_bones:
            for end in ('head', 'tail'):
                setattr(eb, end, inv @ fn(AW @ getattr(eb, end), eb.name == 'head'))
        bpy.ops.object.mode_set(mode='OBJECT')
        bpy.context.view_layer.update()
        for o, ps in target.items():  # objetos presos a osso já andaram com ele: recalcula o local a partir do mundo
            mi = o.matrix_world.inverted()
            for v, p in zip(o.data.vertices, ps):
                v.co = mi @ p

    deform(warp)
    # altura final igual à original: o jogo mede o mago para escalar todos os bonecos (scene.ts, mageScale)
    U = H0 / height(meshes)
    deform(lambda p, head=False: p * U)

# 2. menos polígonos (antes da armadura, para colapsar a malha em repouso). Peças rígidas (chapéu, cajado, capa) são finas e
# rasgam com o mesmo corte: ficam com o dobro
for o in meshes:
    m = o.modifiers.new('decimate', 'DECIMATE')
    m.ratio = FATOR if o.vertex_groups else min(1, FATOR * 2)
    m.use_symmetry = o.name in {'Mage_Body', 'Mage_Head', 'Mage_Hat', 'Mage_Cape'}
    m.symmetry_axis = 'X'
    o.modifiers.move(len(o.modifiers) - 1, 0)
    apply_mod(o, m)

# 3. paleta: a textura de gradientes reduzida a PW×PH; cada face pega a cor do pixel onde cai o centro dela
mat = meshes[0].data.materials[0]
node = next(n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE')
old = node.image
w, h = old.size
px = np.empty(w * h * 4, np.float32)
old.pixels.foreach_get(px)
pal = px.reshape(PH, h // PH, PW, w // PW, 4).mean((1, 3))
img = bpy.data.images.new('ff7_palette', PW, PH, alpha=False)
img.pixels.foreach_set(pal.ravel())
img.pack()
node.image = img
node.interpolation = 'Closest'
for o in meshes:
    me = o.data
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers.active.data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    for p in me.polygons:
        s = slice(p.loop_start, p.loop_start + p.loop_total)
        c = uv[s].mean(0)
        uv[s] = ((min(PW - 1, max(0, int(c[0] * PW))) + 0.5) / PW, (min(PH - 1, max(0, int(c[1] * PH))) + 0.5) / PH)
    me.uv_layers.active.data.foreach_set('uv', uv.ravel())


# 4. mãos em bloco: troca os vértices da mão por uma caixa do mesmo tamanho, presa 100% ao osso da mão
def block_hand(o, side):
    gi = {g.name: g.index for g in o.vertex_groups}
    hand = {gi[n] for n in (f'hand.{side}', f'handslot.{side}') if n in gi}
    bm = bmesh.new()
    bm.from_mesh(o.data)
    dl = bm.verts.layers.deform.verify()
    uvl = bm.loops.layers.uv.active
    hv = {v for v in bm.verts if v[dl] and max(v[dl].items(), key=lambda kv: kv[1])[0] in hand}
    if not hv:
        bm.free()
        return
    co = np.array([v.co[:] for v in hv])
    lo, hi = co.min(0), co.max(0)
    uvs = [tuple(f.loops[0][uvl].uv) for f in bm.faces if all(v in hv for v in f.verts)]
    uv = max(set(uvs), key=uvs.count)
    bmesh.ops.delete(bm, geom=list(hv), context='VERTS')
    cube = bmesh.ops.create_cube(bm, size=1.0)['verts']
    size, mid = Vector(hi - lo) * 0.95, Vector((lo + hi) / 2)
    for v in cube:
        v.co = mid + Vector((v.co.x * size.x, v.co.y * size.y, v.co.z * size.z))
        v[dl][gi[f'hand.{side}']] = 1.0
    for f in {f for v in cube for f in v.link_faces}:
        for lp in f.loops:
            lp[uvl].uv = uv
    bm.to_mesh(o.data)
    bm.free()


for o in meshes:
    if o.name.endswith('ArmLeft'):
        block_hand(o, 'l')
    elif o.name.endswith('ArmRight'):
        block_hand(o, 'r')

# 5. sombreamento chapado (faces visíveis, como no PS1)
for o in meshes:
    with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    o.data.shade_flat()

print('altura final', round(height(meshes), 3), 'triângulos', tris(meshes))
arm.data.pose_position = 'POSE'  # o exportador amostra as animações pela pose
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_def_bones=False, export_animations=True,
                          export_animation_mode='ACTIONS', export_force_sampling=True, export_yup=True)
if BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
