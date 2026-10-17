# python -I resize-img.py <entrada> <saida> <tamanho> [qualidade]  (JPG se a saída for .jpg; PNG mantém alfa)
import sys
from PIL import Image
src, dst, size = sys.argv[1], sys.argv[2], int(sys.argv[3])
q = int(sys.argv[4]) if len(sys.argv) > 4 else 80
im = Image.open(src)
if dst.lower().endswith('.png'):
    im = im.convert('RGBA').resize((size, size), Image.LANCZOS)
    im.save(dst, optimize=True)
else:
    im.convert('RGB').resize((size, size), Image.LANCZOS).save(dst, quality=q, optimize=True)
