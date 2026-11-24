"""Publish one newly approved story. Manual workflow runs only verify the account."""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

import requests
from requests_oauthlib import OAuth1


class Preview(HTMLParser):
    def __init__(self):
        super().__init__()
        self.image = None
        self.canonical = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta" and attrs.get("property") == "og:image":
            self.image = attrs.get("content")
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonical = attrs.get("href")


def run():
    if not os.environ.get("X_OAUTH") or not os.environ.get("BRAND_ID"):
        sys.exit("Configure X_OAUTH and X_BRAND_USER_ID before publishing.")
    keys = json.loads(os.environ["X_OAUTH"])
    auth = OAuth1(keys["api_key"], keys["api_secret"], keys["access_token"], keys["access_secret"])
    def api(method, path, **kwargs):
        r = requests.request(method, "https://api.x.com/2/" + path, auth=auth,
                             timeout=20, allow_redirects=False, **kwargs)
        if not r.ok or r.is_redirect:
            sys.exit(f"X API returned {r.status_code}. Check the account timeline before any retry.")
        return r.json()

    account = api("GET", "users/me")["data"]
    if account["id"] != os.environ["BRAND_ID"]:
        sys.exit("Wrong X account.")
    if os.environ["GITHUB_EVENT_NAME"] == "workflow_dispatch":
        print("Verified @" + account["username"])
        return

    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    paths = subprocess.check_output(["git", "diff", "--diff-filter=A", "--name-only",
                                     event["before"], event["after"], "--", "data/x-approved/"], text=True).splitlines()
    if not paths:
        return
    if len(paths) != 1 or not re.fullmatch(r"data/x-approved/[a-z0-9-]+\.json", paths[0]):
        sys.exit("Expected one new approval.")
    item = json.loads(Path(paths[0]).read_text())
    slug = Path(paths[0]).stem
    base = item["url"]
    if base not in [f"https://harmanhaber.app/{section}/{slug}/" for section in ("haber", "karsilastir")]:
        sys.exit("Expected a permanent story URL matching the filename.")
    age = (datetime.now(timezone.utc) - datetime.fromisoformat(item["approved_at"])).total_seconds()
    if item["approved"] is not True or not 0 <= age <= 3600:
        sys.exit("Missing or stale approval.")
    body = item["text"].strip()
    # Conservative bound for plain Turkish text. No emoji, mentions or secondary links.
    if not body or len(body) + 24 > 280 or any(ord(c) > 0x10ff and c not in "’‘“”…–—" for c in body) or re.search(r"@|://|www\.|\w\.\w", body):
        sys.exit("Invalid post body.")
    page = requests.get(base, timeout=20, allow_redirects=False)
    preview = Preview()
    preview.feed(page.text)
    if page.status_code != 200 or preview.canonical != base or preview.image != "https://harmanhaber.app/icons/og.png":
        sys.exit("Story or brand card did not verify.")
    history = api("GET", f"users/{account['id']}/tweets", params={"max_results":100,"tweet.fields":"entities"})
    if history.get("errors"):
        sys.exit("Timeline verification incomplete.")
    for post in history.get("data", []):
        for link in post.get("entities", {}).get("urls", []):
            if link.get("expanded_url", "").split("?")[0].rstrip("/") == base.rstrip("/"):
                print("Already published: https://x.com/i/status/" + post["id"])
                return
    result = api("POST", "tweets", json={"text":body + "\n" + base + "?utm_source=x&utm_medium=social&utm_campaign=yeni_haber"})
    print("https://x.com/" + account["username"] + "/status/" + result["data"]["id"])


if __name__ == "__main__":
    run()
