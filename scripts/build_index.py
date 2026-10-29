"""Build BEAR's searchable course-materials index on Cloudflare.

Runs in GitHub Actions (see .github/workflows/index.yml). Steps:
 1. Load the textbook chunks in corpus/books.jsonl.
 2. Download the course web pages listed in corpus/web_sources.json and chunk them.
 3. Embed every chunk with Cloudflare Workers AI (bge-base-en-v1.5).
 4. Upload the vectors + text to the Cloudflare Vectorize index.

Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, INDEX_NAME (default bear-index), REBUILD (true/false)
"""
import hashlib, json, os, sys, time
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent))
from web_text import chunk_page  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
ACCOUNT = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
if not TOKEN or not ACCOUNT:
    sys.exit("ERROR: GitHub repository secrets CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set.")
INDEX = os.environ.get("INDEX_NAME", "bear-index")
REBUILD = os.environ.get("REBUILD", "false").lower() == "true"
EMBED_MODEL = "@cf/baai/bge-base-en-v1.5"
API = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}"
HDR = {"Authorization": f"Bearer {TOKEN}"}
UA = {"User-Agent": "Mozilla/5.0 (BEAR course assistant indexer)"}


def cf(method, path, **kw):
    for attempt in range(5):
        r = requests.request(method, API + path, headers={**HDR, **kw.pop("headers", {})}, timeout=120, **kw)
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(5 * (attempt + 1))
            continue
        return r
    return r


def ensure_index():
    r = cf("GET", f"/vectorize/v2/indexes/{INDEX}")
    if r.ok and REBUILD:
        print(f"Deleting index {INDEX} for a clean rebuild")
        cf("DELETE", f"/vectorize/v2/indexes/{INDEX}").raise_for_status()
        time.sleep(5)
        r = cf("GET", f"/vectorize/v2/indexes/{INDEX}")
    if not r.ok:
        print(f"Creating index {INDEX}")
        c = cf("POST", "/vectorize/v2/indexes", json={
            "name": INDEX, "description": "BEAR course materials",
            "config": {"dimensions": 768, "metric": "cosine"}})
        if not c.ok and not cf("GET", f"/vectorize/v2/indexes/{INDEX}").ok:
            sys.exit(f"Could not create index: {c.status_code} {c.text}")
        time.sleep(5)


def fetch(url):
    r = requests.get(url, headers=UA, timeout=60)
    r.raise_for_status()
    r.encoding = r.encoding or "utf-8"
    return r.text


def web_chunks():
    cfg = json.loads((ROOT / "corpus" / "web_sources.json").read_text())
    out = []
    for i, page in enumerate(cfg["pages"]):
        try:
            urls = []
            if "find_link" in page:
                fl = page["find_link"]
                soup = BeautifulSoup(fetch(fl["on"]), "lxml")
                hits = [a["href"] for a in soup.select("a[href]") if fl["contains"] in a["href"]]
                if not hits:
                    raise RuntimeError(f"no link containing {fl['contains']} on {fl['on']}")
                urls = [(page["title"], urljoin(fl["on"], hits[0]))]
            elif page.get("follow_chapters"):
                soup = BeautifulSoup(fetch(page["url"]), "lxml")
                seen = []
                for a in soup.select("li.chapter a[href]"):
                    href = urljoin(page["url"], a["href"].split("#")[0])
                    if href.startswith(page["url"]) and "references" not in href and href not in seen:
                        seen.append(href)
                urls = [(page["title"], u) for u in seen] or [(page["title"], page["url"])]
            else:
                urls = [(page["title"], page["url"])]
            for title, url in urls:
                html = fetch(url)
                prefix = "web-" + hashlib.sha1(url.encode()).hexdigest()[:10]
                chunks = chunk_page(html, title, url, prefix)
                print(f"  {len(chunks):3d} chunks  {url}")
                out += chunks
                time.sleep(0.5)
        except Exception as e:  # keep going; one dead link should not block the whole index
            print(f"  WARNING: skipped {page.get('url') or page['title']}: {e}")
    return out


def embed(texts):
    r = cf("POST", f"/ai/run/{EMBED_MODEL}", json={"text": texts})
    if not r.ok:
        sys.exit(f"Embedding failed: {r.status_code} {r.text[:500]}")
    return r.json()["result"]["data"]


def main():
    books = [json.loads(l) for l in (ROOT / "corpus" / "books.jsonl").read_text(encoding="utf-8").splitlines() if l]
    print(f"Textbook chunks: {len(books)}")
    print("Downloading course web pages...")
    web = web_chunks()
    print(f"Web chunks: {len(web)}")
    chunks = books + web

    ensure_index()
    batch_size = 100
    done = 0
    for b in range(0, len(chunks), batch_size):
        batch = chunks[b:b + batch_size]
        texts = [f"{c['source']} - {c['section']}\n{c['text']}" for c in batch]
        vecs = embed(texts)
        lines = []
        for c, v in zip(batch, vecs):
            meta = {k: c[k] for k in ("source", "section", "url", "text") if c.get(k)}
            if c.get("page"):
                meta["page"] = c["page"]
            lines.append(json.dumps({"id": c["id"][:64], "values": v, "metadata": meta}))
        r = cf("POST", f"/vectorize/v2/indexes/{INDEX}/upsert",
               data="\n".join(lines).encode(), headers={"Content-Type": "application/x-ndjson"})
        if not r.ok:
            sys.exit(f"Upsert failed: {r.status_code} {r.text[:500]}")
        done += len(batch)
        print(f"  indexed {done}/{len(chunks)}")
    print(f"Done. {done} passages in Vectorize index '{INDEX}'.")


if __name__ == "__main__":
    main()
