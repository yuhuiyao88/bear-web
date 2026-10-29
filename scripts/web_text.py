"""Extract readable text sections from a statistics web page (UCLA OARC, bookdown, SSCC)."""
import re
from bs4 import BeautifulSoup

CONTENT_SELECTORS = ["div.entry-content", "section.normal", "div.page-inner", "main", "article", "div#content", "body"]


def main_content(soup):
    for sel in CONTENT_SELECTORS:
        el = soup.select_one(sel)
        if el and len(el.get_text(" ", strip=True).split()) > 200:
            return el
    return soup.body or soup


def sections(html):
    """Yield (heading, text) pairs. Code blocks and their output are dropped so
    BEAR is not fed ready-made R code."""
    soup = BeautifulSoup(html, "lxml")
    root = main_content(soup)
    for tag in root.select("script, style, nav, header, footer, pre, .sourceCode, #TOC, .book-summary, .sidebar, form"):
        tag.decompose()
    heading, buf = "", []
    for el in root.find_all(["h1", "h2", "h3", "h4", "p", "li", "td", "th", "blockquote", "dd", "dt"]):
        if el.find_parent(["li", "td", "blockquote"]) and el.name in ("p",):
            continue  # avoid double-counting nested paragraphs
        text = re.sub(r"\s+", " ", el.get_text(" ", strip=True))
        if not text:
            continue
        if el.name in ("h1", "h2", "h3", "h4"):
            if buf:
                yield heading, " ".join(buf)
            heading, buf = text[:120], []
        else:
            buf.append(text)
    if buf:
        yield heading, " ".join(buf)


def chunk_page(html, title, url, id_prefix, chunk_words=300, overlap=40):
    chunks = []
    for heading, text in sections(html):
        words = text.split()
        start = 0
        while start < len(words):
            piece = words[start:start + chunk_words]
            if len(piece) >= 25 or not chunks:
                chunks.append({
                    "id": f"{id_prefix}-{len(chunks):04d}",
                    "source": title,
                    "section": heading or title,
                    "page": None,
                    "url": url,
                    "text": " ".join(piece),
                })
            if start + chunk_words >= len(words):
                break
            start += chunk_words - overlap
    return chunks
