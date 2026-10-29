"""Turn the four open-license textbooks (PDF) into searchable text chunks.

Run once, offline, where the PDFs are available:
    python scripts/extract_books.py <folder-with-pdfs>
Writes corpus/books.jsonl. The PDFs themselves are not stored in this repo;
see corpus/SOURCES.md for where to download each book.
"""
import json, re, subprocess, sys
from pathlib import Path

import pypdf

BOOKS = [
    {
        "id": "openintro",
        "file": "os.pdf",
        "title": "OpenIntro Statistics (4th ed.)",
        "url": "https://www.openintro.org/book/os/",
        "pages": (6, 382),  # skip front matter and appendices (exercise solutions, tables)
        "headings": "numbered",
    },
    {
        "id": "biostat",
        "file": "biostat.pdf",
        "title": "Introductory Statistics for the Life and Biomedical Sciences",
        "url": "https://www.openintro.org/book/biostat/",
        "pages": (9, 433),
        "headings": "numbered",
    },
    {
        "id": "onlinestatbook",
        "file": "Online_Statistics_Education.pdf",
        "title": "Online Statistics Education (Lane et al.)",
        "url": "https://onlinestatbook.com/",
        "pages": (9, 691),
        "headings": "outline",
    },
    {
        "id": "ward",
        "file": "fullText - Caitlin Ward.pdf",
        "title": "An Intuitive, Interactive Introduction to Biostatistics (Ward & Nolte)",
        "url": "https://doi.org/10.25820/work.006232",
        "pages": (2, 108),
        "headings": "numbered",
    },
]

CHUNK_WORDS = 300
OVERLAP_WORDS = 40

NUM_ONLY = re.compile(r"^(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)$")
NUM_TITLE = re.compile(r"^(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\s+([A-Z][^\n]{2,70})$")
RUNNING_HEAD = re.compile(r"^(CHAPTER \d+\.|\d{1,3}$|\d+\.\d+\. [A-Z ]+$)")


def page_texts(pdf, first, last):
    out = subprocess.run(
        ["pdftotext", "-f", str(first + 1), "-l", str(last + 1), "-enc", "UTF-8", str(pdf), "-"],
        capture_output=True, text=True, check=True,
    ).stdout
    return out.split("\f")


def outline_map(pdf):
    """page index -> 'Chapter > Section' from the PDF bookmarks."""
    r = pypdf.PdfReader(str(pdf))
    marks = []

    def walk(items, chapter=None):
        for it in items:
            if isinstance(it, list):
                walk(it, chapter_holder[0])
            else:
                p = r.get_destination_page_number(it)
                title = it.title.strip()
                if chapter is None:
                    chapter_holder[0] = title
                    marks.append((p, title))
                else:
                    marks.append((p, f"{chapter} > {title}"))

    chapter_holder = [None]
    walk(r.outline)
    marks.sort()
    return marks


def chapter_titles(pdf):
    r = pypdf.PdfReader(str(pdf))
    marks = []
    for it in r.outline:
        if not isinstance(it, list):
            marks.append((r.get_destination_page_number(it), it.title.strip()))
    return sorted(marks)


def lookup(marks, page):
    cur = ""
    for p, t in marks:
        if p <= page:
            cur = t
        else:
            break
    return cur


def clean_lines(text):
    text = re.sub(r"-\n(?=[a-z])", "", text)  # re-join hyphenated words
    lines = [l.strip() for l in text.split("\n")]
    return [l for l in lines if l and not RUNNING_HEAD.match(l)]


def extract(book, folder):
    pdf = Path(folder) / book["file"]
    first, last = book["pages"]
    pages = page_texts(pdf, first, last)
    marks = outline_map(pdf) if book["headings"] == "outline" else chapter_titles(pdf)

    # Build a stream of (word, page, section)
    section = ""
    last_num = (0,)

    def accept(num, title, same_line):
        """Reject table rows and exercise numbers that look like headings
        (e.g. '0.0 Peanut Avoidance', '3.6 Dice rolls. If you roll...')."""
        nonlocal last_num
        parts = tuple(int(x) for x in num.split("."))
        if parts[1] == 0 or parts[1] > 12 or "NA" in title.split():
            return False
        if ". " in title or "?" in title or "(" in title or title.endswith(":"):
            return False
        if same_line and len(title.split()) < 2:
            return False
        chap_num = re.match(r"^(\d+)", chapter or "")
        if chap_num:  # PDF has chapter bookmarks: heading must belong to current chapter
            return parts[0] == int(chap_num.group(1))
        if parts <= last_num or parts[0] - last_num[0] > 1:
            return False
        last_num = parts
        return True
    stream = []
    for i, raw in enumerate(pages):
        page = first + i
        chapter = lookup(marks, page)
        if book["headings"] == "numbered" and chapter and not section.startswith(chapter.split()[0] + "."):
            section = chapter if marks else section
        lines = clean_lines(raw)
        j = 0
        while j < len(lines):
            line = lines[j]
            if book["headings"] == "numbered":
                m = NUM_TITLE.match(line)
                if m and not line.endswith(".") and not line.endswith(":") and accept(m.group(1), m.group(2), True):
                    section = f"{m.group(1)} {m.group(2)}"
                elif NUM_ONLY.match(line) and j + 1 < len(lines) and len(lines[j + 1]) <= 70 \
                        and lines[j + 1][:1].isupper() and not lines[j + 1].endswith(".") \
                        and accept(line, lines[j + 1], False):
                    section = f"{line} {lines[j + 1]}"
                    j += 1
                    stream += [(w, page, section) for w in lines[j].split()]
                    j += 1
                    continue
                label = section or chapter
            else:
                label = chapter
            stream += [(w, page, label) for w in line.split()]
            j += 1

    chunks, start = [], 0
    while start < len(stream):
        window = stream[start:start + CHUNK_WORDS]
        words = [w for w, _, _ in window]
        _, page, label = window[0]
        chunks.append({
            "id": f"{book['id']}-{len(chunks):04d}",
            "source": book["title"],
            "section": label or "Introduction",
            "page": page + 1,  # 1-based PDF page
            "url": book["url"],
            "text": " ".join(words),
        })
        if start + CHUNK_WORDS >= len(stream):
            break
        start += CHUNK_WORDS - OVERLAP_WORDS
    return chunks


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else "."
    out = Path(__file__).resolve().parent.parent / "corpus" / "books.jsonl"
    total = 0
    with out.open("w", encoding="utf-8") as f:
        for book in BOOKS:
            chunks = extract(book, folder)
            total += len(chunks)
            print(f"{book['title']}: {len(chunks)} chunks")
            for c in chunks:
                f.write(json.dumps(c, ensure_ascii=False) + "\n")
    print(f"Total: {total} chunks -> {out}")


if __name__ == "__main__":
    main()
