"""Build the site data from books/.

Usage: python tools/build.py

For each books/<id>/book.json:
  - aligns each chapter's text.md to its words.json and writes site/books/<id>/<nn>.json
  - encodes the chapter audio to site/books/<id>/<nn>.m4a (only if missing)
  - copies the cover
Then writes site/library.json.

The text is the source of truth for what the reader sees. The timings come from words.json,
which retime.py makes from text.md. If text.md changed after that, the build links each edited
word to the nearest timed words, and it tells you to run retime.py again for exact times.
"""
import difflib
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
ABBREVIATIONS = {"mr.", "mrs.", "ms.", "dr.", "st.", "prof."}


def norm(token):
    return re.sub(r"[^a-z0-9]", "", token.lower())


def spread(tokens, times, i1, i2, start, end):
    """Share the time span [start, end] over tokens[i1:i2], in proportion to their length."""
    weights = [len(t) + 1 for t in tokens[i1:i2]]
    total, at = sum(weights), start
    for k, weight in enumerate(weights):
        step = (end - start) * weight / total
        times[i1 + k] = (at, at + step)
        at += step


def align(tokens, words):
    """Give each text token a (start, end) time from the closest matching timed words.

    Returns the times and, for each token, True if it matched a timed word exactly.
    """
    times, matched = [None] * len(tokens), [False] * len(tokens)
    matcher = difflib.SequenceMatcher(None, [norm(t) for t in tokens], [norm(w[0]) for w in words], autojunk=False)
    for op, i1, i2, j1, j2 in matcher.get_opcodes():
        if op == "equal":
            for k in range(i2 - i1):
                times[i1 + k] = tuple(words[j1 + k][1:3])
                matched[i1 + k] = True
        elif op == "replace":
            spread(tokens, times, i1, i2, words[j1][1], words[j2 - 1][2])
        elif op == "delete":  # text has words that the audio does not: squeeze them into the gap
            start = words[j1 - 1][2] if j1 > 0 else 0.0
            end = words[j1][1] if j1 < len(words) else start
            spread(tokens, times, i1, i2, start, end)
        # "insert": the audio has words that the text does not. They get no token.
    return times, matched


def ends_sentence(token):
    initial = re.fullmatch(r"[A-Z]\.", token)  # "J. K. Rowling"
    return re.search(r"[.!?][\"'”’)]*$", token) and token.lower() not in ABBREVIATIONS and not initial


def parse(text):
    """Split text.md into blocks of sentences of tokens.

    Blocks are separated by blank lines. "# " marks a heading, and "*" alone is a scene break.
    """
    blocks = []
    for raw in re.split(r"\n\s*\n", text.strip()):
        if raw.strip() == "*":
            blocks.append({"type": "break", "sentences": []})
            continue
        sentences = [[]]
        for token in raw.removeprefix("# ").split():
            sentences[-1].append(token)
            if ends_sentence(token):
                sentences.append([])
        blocks.append({"type": "h" if raw.startswith("# ") else "p", "sentences": [s for s in sentences if s]})
    return blocks


def tokens_of(blocks):
    return [t for b in blocks for s in b["sentences"] for t in s]


def build_chapter(text, words):
    """Return the blocks of text.md with timed tokens, and the number of tokens without an exact time."""
    blocks = parse(text)
    times, matched = align(tokens_of(blocks), words)
    times = iter(times)
    for block in blocks:
        for sentence in block["sentences"]:
            for k, token in enumerate(sentence):
                start, end = next(times)
                sentence[k] = [token, round(start, 2), round(end, 2)]
    return blocks, matched.count(False)


def encode(src, dst):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-map", "0:a", "-ac", "1",
                    "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", str(dst)], check=True)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         check=True, capture_output=True, text=True).stdout
    return round(float(out), 2)


def main():
    library = []
    for book_file in sorted((ROOT / "books").glob("*/book.json")):
        book_dir, book_id = book_file.parent, book_file.parent.name
        book = json.loads(book_file.read_text(encoding="utf-8"))
        out_dir = SITE / "books" / book_id
        out_dir.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(book_dir / book["cover"], out_dir / book["cover"])

        chapters = []
        for n, chapter in enumerate(book["chapters"], 1):
            src_dir = book_dir / f"{n:02d}"
            audio = out_dir / f"{n:02d}.m4a"
            if not audio.exists():
                encode(ROOT / chapter["audio"], audio)
            words = json.loads((src_dir / "words.json").read_text(encoding="utf-8"))
            blocks, untimed = build_chapter((src_dir / "text.md").read_text(encoding="utf-8"), words)
            data = {"title": chapter["title"], "audio": f"books/{book_id}/{audio.name}",
                    "duration": duration(audio), "blocks": blocks}
            (out_dir / f"{n:02d}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")),
                                                   encoding="utf-8", newline="\n")
            chapters.append({"n": n, "title": chapter["title"], "data": f"books/{book_id}/{n:02d}.json",
                             "duration": data["duration"]})
            print(f"{book_id} {n:02d}: {len(tokens_of(blocks))} tokens, {len(blocks)} blocks")
            if untimed:
                print(f"  {untimed} tokens changed after the last retime; run tools/retime.py {book_dir.relative_to(ROOT)} {n}")

        library.append({"id": book_id, "title": book["title"], "author": book["author"],
                        "narrator": book["narrator"], "cover": f"books/{book_id}/{book['cover']}",
                        "chapters": chapters})
    (SITE / "library.json").write_text(json.dumps(library, ensure_ascii=False, indent=2) + "\n",
                                       encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
