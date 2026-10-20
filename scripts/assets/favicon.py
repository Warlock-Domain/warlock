# Ícone do site (= foto do grupo do Telegram): o W da logo (Grenze Gotisch 700, degradê ouro→lava como no jogo) sobre fundo meio lava meio escuro, com moldura dourada estilo logo do WoW
# python -I scripts/assets/favicon.py <GrenzeGotisch-700.ttf> public   (fonte: Google Fonts, OFL)
import math, random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

font_path, out = sys.argv[1:3]
S = 1024
cx = cy = S / 2
random.seed(3)

def grad(size, stops):  # degradê vertical
    w, h = size
    img = Image.new('RGB', (w, h))
    px = img.load()
    for y in range(h):
        t = min(max(y / (h - 1), stops[0][0]), stops[-1][0])
        for i in range(len(stops) - 1):
            (t0, c0), (t1, c1) = stops[i], stops[i + 1]
            if t0 <= t <= t1:
                k = (t - t0) / (t1 - t0)
                c = tuple(int(c0[j] + (c1[j] - c0[j]) * k) for j in range(3))
                break
        for x in range(w):
            px[x, y] = c
    return img

# fundo: escuro em cima, lava subindo de baixo, com veios brilhando e brasas
bg = grad((S, S), [(0, (10, 4, 6)), (0.45, (30, 8, 6)), (0.75, (120, 30, 8)), (1, (255, 110, 30))])
veios = Image.new('L', (S, S), 0)
d = ImageDraw.Draw(veios)
for _ in range(22):
    x, y, rx, ry = random.uniform(0, S), random.uniform(S * 0.62, S * 1.05), random.uniform(60, 160), random.uniform(18, 45)
    d.ellipse((x - rx, y - ry, x + rx, y + ry), fill=random.randint(90, 200))
veios = veios.filter(ImageFilter.GaussianBlur(22))
bg = Image.composite(Image.new('RGB', (S, S), (255, 170, 60)), bg, veios)
brasas = Image.new('L', (S, S), 0)
d = ImageDraw.Draw(brasas)
for _ in range(70):
    x, y, r = random.uniform(0, S), random.uniform(S * 0.2, S), random.uniform(1.5, 4)
    d.ellipse((x - r, y - r, x + r, y + r), fill=random.randint(140, 255))
bg = Image.composite(Image.new('RGB', (S, S), (255, 200, 110)), bg, brasas.filter(ImageFilter.GaussianBlur(1)))
# vinheta escura nas bordas
vin = Image.new('L', (S, S), 0)
ImageDraw.Draw(vin).ellipse((-S * 0.1, -S * 0.1, S * 1.1, S * 1.1), fill=255)
bg = Image.composite(bg, Image.new('RGB', (S, S), (0, 0, 0)), vin.filter(ImageFilter.GaussianBlur(90)))

# moldura: anel dourado grosso com bisel (claro em cima, escuro embaixo), filete interno e rebites
def ring(r_out, r_in):
    m = Image.new('L', (S, S), 0)
    dd = ImageDraw.Draw(m)
    dd.ellipse((cx - r_out, cy - r_out, cx + r_out, cy + r_out), fill=255)
    dd.ellipse((cx - r_in, cy - r_in, cx + r_in, cy + r_in), fill=0)
    return m
ouro = grad((S, S), [(0, (255, 244, 180)), (0.35, (240, 190, 70)), (0.6, (170, 105, 25)), (1, (255, 214, 102))])
ouro_esc = grad((S, S), [(0, (120, 70, 15)), (1, (60, 30, 5))])
R = S * 0.47
bg = Image.composite(ouro_esc, bg, ring(R + 6, R - 52).filter(ImageFilter.GaussianBlur(1)))  # sombra/borda escura
bg = Image.composite(ouro, bg, ring(R, R - 44))
bg = Image.composite(ouro.transpose(Image.FLIP_TOP_BOTTOM), bg, ring(R - 14, R - 30))  # bisel invertido no meio do anel
bg = Image.composite(ouro, bg, ring(R - 60, R - 68))  # filete fino de dentro
d = ImageDraw.Draw(bg)
for k in range(8):
    a = k * math.pi / 4 + math.pi / 8
    x, y = cx + (R - 22) * math.cos(a), cy + (R - 22) * math.sin(a)
    d.ellipse((x - 9, y - 9, x + 9, y + 9), fill=(110, 60, 10))
    d.ellipse((x - 6, y - 7, x + 5, y + 4), fill=(255, 236, 160))

# o W: degradê da logo (ouro claro → ouro → lava), contorno escuro e brilho de lava atrás
font = ImageFont.truetype(font_path, int(S * 0.62))
m = Image.new('L', (S, S), 0)
ImageDraw.Draw(m).text((cx, cy + S * 0.02), 'W', font=font, anchor='mm', fill=255)
glow = m.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(28))
bg = Image.composite(Image.new('RGB', (S, S), (255, 120, 30)), bg, Image.eval(glow, lambda v: int(v * 0.9)))
borda = m.filter(ImageFilter.MaxFilter(13))
bg = Image.composite(Image.new('RGB', (S, S), (30, 8, 2)), bg, borda)
letra = grad((S, S), [(0.2, (255, 242, 160)), (0.45, (255, 214, 102)), (0.8, (255, 138, 58))])
bg = Image.composite(letra, bg, m)
# brilho no topo da letra
topo = ImageChops.multiply(m, grad((S, S), [(0, (255, 255, 255)), (0.42, (255, 255, 255)), (0.5, (0, 0, 0)), (1, (0, 0, 0))]).convert('L'))
bg = Image.composite(Image.new('RGB', (S, S), (255, 252, 225)), bg, Image.eval(topo.filter(ImageFilter.GaussianBlur(2)), lambda v: int(v * 0.35)))

# aba: redondo com o fundo transparente (16, 32 e 48 no mesmo .ico); iPhone: quadrado, o iOS não aceita transparência
# recortado na borda de fora da moldura, para o W ocupar o máximo da aba
B = int(R + 7)
redondo = bg.crop((int(cx) - B, int(cy) - B, int(cx) + B, int(cy) + B)).convert('RGBA')
c = Image.new('L', redondo.size, 0)
ImageDraw.Draw(c).ellipse((0, 0, 2 * B - 1, 2 * B - 1), fill=255)
redondo.putalpha(c)
redondo.save(f'{out}/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
bg.resize((180, 180), Image.LANCZOS).save(f'{out}/apple-touch-icon.png', optimize=True)
