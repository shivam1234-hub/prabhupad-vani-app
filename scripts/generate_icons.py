#!/usr/bin/env python3
"""Generate all required Expo app icons from logo_source.png"""

from PIL import Image, ImageDraw
import os
import sys

SOURCE = os.path.join(os.path.dirname(__file__), '..', 'assets', 'logo_source.png')
ASSETS = os.path.join(os.path.dirname(__file__), '..', 'assets')

def make_square(img, size, bg_color=(255, 255, 255, 255)):
    """Resize image to square, keeping aspect ratio, with background."""
    img = img.convert("RGBA")
    result = Image.new("RGBA", (size, size), bg_color)
    img.thumbnail((size, size), Image.LANCZOS)
    offset = ((size - img.width) // 2, (size - img.height) // 2)
    result.paste(img, offset, img)
    return result

def make_splash(img, width, height, bg_color=(255, 255, 255, 255)):
    """Create splash screen with logo centered on background."""
    img = img.convert("RGBA")
    result = Image.new("RGBA", (width, height), bg_color)
    logo_size = int(min(width, height) * 0.55)
    img.thumbnail((logo_size, logo_size), Image.LANCZOS)
    offset = ((width - img.width) // 2, (height - img.height) // 2)
    result.paste(img, offset, img)
    return result

if not os.path.exists(SOURCE):
    print(f"ERROR: Source image not found at:\n  {SOURCE}")
    print("\nPlease save the logo as: assets/logo_source.png")
    sys.exit(1)

print(f"Loading logo from: {SOURCE}")
src = Image.open(SOURCE)
print(f"Original size: {src.size}")

# icon.png - 1024x1024, white background
icon = make_square(src, 1024, (255, 255, 255, 255))
icon.save(os.path.join(ASSETS, 'icon.png'))
print("✓ icon.png (1024x1024)")

# adaptive-icon.png - 1024x1024, white background (Android)
adaptive = make_square(src, 1024, (255, 255, 255, 255))
adaptive.save(os.path.join(ASSETS, 'adaptive-icon.png'))
print("✓ adaptive-icon.png (1024x1024)")

# splash.png - 1284x2778, white background
splash = make_splash(src, 1284, 2778, (255, 255, 255, 255))
splash.save(os.path.join(ASSETS, 'splash.png'))
print("✓ splash.png (1284x2778)")

# favicon.png - 48x48
favicon = make_square(src, 48, (255, 255, 255, 255))
favicon.save(os.path.join(ASSETS, 'favicon.png'))
print("✓ favicon.png (48x48)")

print("\nAll icons generated successfully!")
