"""
将小红书HTML的7张卡片分别截图保存为JPG
使用Playwright截取每个.card元素
"""
import subprocess, sys, os

def install():
    subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright", "-q"])
    subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium", "--with-deps"])

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    install()
    from playwright.sync_api import sync_playwright

HTML_FILE = r"c:\kimi\修仙与地下城\game-intro\小红书-修仙与地下城.html"
OUT_DIR = r"c:\kimi\修仙与地下城\game-intro\xhs"

os.makedirs(OUT_DIR, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1080, "height": 1440})
    page.goto(f"file:///{HTML_FILE.replace(os.sep, '/')}")
    page.wait_for_timeout(2000)

    cards = page.query_selector_all(".card")
    print(f"Found {len(cards)} cards")

    for i, card in enumerate(cards, 1):
        out_path = os.path.join(OUT_DIR, f"xhs_{i:02d}.jpg")
        card.screenshot(path=out_path, type="jpeg", quality=95)
        size_kb = os.path.getsize(out_path) / 1024
        print(f"Saved: {out_path} ({size_kb:.0f} KB)")

    browser.close()

print("Done!")
