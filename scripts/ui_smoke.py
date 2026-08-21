from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts" / "ui-smoke"
ARTIFACTS.mkdir(parents=True, exist_ok=True)

PAGES = [
    ("hub", 5173, "/", "One account for every KpnSolute product."),
    ("accounts", 5174, "/security", "Security and sign-in"),
    ("platform", 5175, "/editor", "SOP and site editor"),
    ("create", 5176, "/compute/new", "Create a Compute organization"),
    ("billing", 5177, "/subscriptions", "Subscriptions"),
    ("link", 5178, "/deliveries", "Delivery health"),
    ("flow", 5179, "/runs", "Run history"),
]

def api(route):
    url = route.request.url
    if url.endswith("/auth/session"):
        route.fulfill(status=200, content_type="application/json", body='{"data":{"user":{"id":"smoke","primaryEmail":"qa@kpnsolute.test","displayName":"QA Operator"}}}')
    else:
        route.fulfill(status=200, content_type="application/json", body='{"data":[]}')

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.route("http://localhost:4000/**", api)
    for name, port, path, heading in PAGES:
        page.goto(f"http://localhost:{port}{path}")
        page.wait_for_load_state("networkidle")
        page.get_by_text(heading, exact=True).first.wait_for()
        page.screenshot(path=str(ARTIFACTS / f"{name}.png"), full_page=True)
    browser.close()
print(f"Verified {len(PAGES)} rendered routes; screenshots: {ARTIFACTS}")
