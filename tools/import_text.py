"""Import the book text from a PDF into books/<id>/<nn>/text.md.

Usage: python tools/import_text.py books/hp1 [--force]

Reads book.json "source": {"pdf": ..., "end": ...}. "end" is the first line after the story (back matter).
Needs pdftotext (poppler). Expects a typeset book: "— CHAPTER ONE —" lines with the title on the next
line, paragraphs that start with an indent, and one running header line at the top of most pages.
Writes only the chapters listed in book.json, and does not overwrite an existing text.md unless --force is given.
"""
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

CHAPTER = re.compile(r"\s*— CHAPTER ([A-Z-]+) —\s*")


def layout_text(pdf):
    return subprocess.run(["pdftotext", "-enc", "UTF-8", "-layout", str(pdf), "-"],
                          check=True, capture_output=True).stdout.decode("utf-8")


def is_header(line):
    """Running headers at the top of a page: "8  Harry Potter", "The Boy Who Lived  9"."""
    line = line.strip()
    return bool(re.fullmatch(r"\d+\s+Harry Potter|.*\S\s{2,}\d+", line))


def dehyphenate(lines, known):
    """Join words split over two lines: "hap-" + "pening" -> "happening", but keep "emerald-green"."""
    text = lines[0]
    for line in lines[1:]:
        head = re.search(r"(\S+)-$", text)
        tail = re.match(r"(\S+)", line)
        if head and tail and text[-2].isalpha():
            word = re.sub(r"\W", "", head.group(1) + tail.group(1)).lower()
            hyphenated = re.sub(r"[^\w-]", "", head.group(1) + "-" + tail.group(1)).lower()
            if known[hyphenated] > known[word]:
                text += line
            else:
                text = text[:-1] + line
        else:
            text += " " + line
    return text


def chapters(text, end):
    text = text.split(end)[0]
    known = Counter(w.lower() for w in re.findall(r"[\w’'-]+", text))  # spellings seen in the book
    lines = text.replace("\r", "").split("\n")
    starts = [i for i, line in enumerate(lines) if CHAPTER.fullmatch(line.replace("\f", ""))]
    for k, start in enumerate(starts):
        number = CHAPTER.fullmatch(lines[start].replace("\f", "")).group(1).capitalize()
        body = lines[start + 1:starts[k + 1] if k + 1 < len(starts) else len(lines)]
        # The title: short lines, each followed by a blank line (a long title wraps over two).
        title_lines, title_end = [], 0
        for i, line in enumerate(body):
            if not line.strip():
                continue
            if len(line.strip()) > 45 or (i + 1 < len(body) and body[i + 1].strip()):
                break
            title_lines.append(line.strip())
            title_end = i + 1
        title = " ".join(title_lines)
        paragraphs, current, page_top = [], [], False
        for line in body[title_end:]:
            if "\f" in line:
                page_top = True
                line = line.replace("\f", "")
            if not line.strip():
                continue
            if page_top:
                page_top = False
                if is_header(line):
                    continue
            # A scene break ("*") is a block of its own; the paragraph after it has no indent.
            new_paragraph = line.startswith(" ") or line.strip() == "*" or current == ["*"]
            if new_paragraph and current:
                paragraphs.append(dehyphenate(current, known))
                current = []
            current.append(line.strip())
        if current:
            paragraphs.append(dehyphenate(current, known))
        yield f"# Chapter {number}: {title}", paragraphs


def main(book_dir, force):
    book_dir = Path(book_dir)
    book = json.loads((book_dir / "book.json").read_text(encoding="utf-8"))
    source = book["source"]
    found = list(chapters(layout_text(book_dir / source["pdf"]), source["end"]))
    for n, (heading, paragraphs) in enumerate(found[:len(book["chapters"])], 1):
        path = book_dir / f"{n:02d}" / "text.md"
        if path.exists() and not force:
            print(f"{path} exists, skipped (use --force to replace it)")
            continue
        path.parent.mkdir(exist_ok=True)
        path.write_text("\n\n".join([heading, *paragraphs]) + "\n", encoding="utf-8", newline="\n")
        print(f"{path}: {heading[2:]}, {len(paragraphs)} paragraphs")


if __name__ == "__main__":
    main(sys.argv[1], "--force" in sys.argv[2:])
