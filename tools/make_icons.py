from pathlib import Path
from PIL import Image, ImageDraw

PUBLIC = Path("C:/Users/user/BookVaultAI/frontend/public")
PUBLIC.mkdir(parents=True, exist_ok=True)
S = 1024
DARK = (28, 25, 23, 255)
CREAM = (231, 201, 169, 255)
RUST = (180, 86, 47, 255)

# Full-bleed transparent-corner icon used for favicons and manifest icons.
icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(icon)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=230, fill=DARK)

# Stylised Y + shelf, matching the in-app brand mark.
arm = 78
d.line([(286, 250), (512, 540), (738, 250)], fill=CREAM, width=arm, joint="curve")
d.line([(512, 540), (512, 790)], fill=CREAM, width=arm)
for x, y in ((286, 250), (738, 250), (512, 790)):
    d.ellipse([x - arm // 2, y - arm // 2, x + arm // 2, y + arm // 2], fill=CREAM)

shelf = 46
d.line([(330, 842), (694, 842)], fill=RUST, width=shelf)
for x in (330, 694):
    d.ellipse([x - shelf // 2, 842 - shelf // 2, x + shelf // 2, 842 + shelf // 2], fill=RUST)

for size, name in [
    (16, "favicon-16x16.png"),
    (32, "favicon-32x32.png"),
    (48, "favicon-48x48.png"),
    (192, "icon-192.png"),
    (512, "icon-512.png"),
]:
    icon.resize((size, size), Image.Resampling.LANCZOS).save(PUBLIC / name, optimize=True)

# iOS masks the corners itself, so use an opaque square with a little breathing room.
apple = Image.new("RGBA", (S, S), DARK)
apple.alpha_composite(icon, (0, 0))
apple.resize((180, 180), Image.Resampling.LANCZOS).save(PUBLIC / "apple-touch-icon.png", optimize=True)

icon.save(
    PUBLIC / "favicon.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48)],
)

(PUBLIC / "favicon.svg").write_text(
    """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="14.4" fill="#1c1917"/>
  <path d="M17.9 15.6 32 33.8l14.1-18.2M32 33.8v15.6" stroke="#e7c9a9" stroke-width="4.9" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M20.6 52.6h22.8" stroke="#b4562f" stroke-width="2.9" stroke-linecap="round"/>
</svg>
""",
    encoding="utf-8",
)

(PUBLIC / "site.webmanifest").write_text(
    """{
  "name": "YVO's Book Vault",
  "short_name": "Book Vault",
  "description": "A private reading library, session tracker, analytics workspace and AI-assisted knowledge base.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#faf7f2",
  "theme_color": "#1c1917",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
""",
    encoding="utf-8",
)

print("icons written:")
for p in sorted(PUBLIC.glob("favicon*")) + sorted(PUBLIC.glob("icon-*")) + sorted(PUBLIC.glob("apple-*")) + [PUBLIC / "site.webmanifest"]:
    print(p.name, p.stat().st_size)
