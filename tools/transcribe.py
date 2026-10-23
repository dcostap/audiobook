"""Transcribe one chapter with Whisper.

Usage: python tools/transcribe.py books/hp1 1

Writes books/hp1/01/whisper.json: the words Whisper hears, with rough times. retime.py uses it as
a map to find which part of the text is where in the audio.
If the chapter has no text.md yet (no book text), it also writes a first draft of text.md.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# ctranslate2 loads the CUDA libraries from the nvidia-* wheels at run time.
for bin_dir in (Path(sys.prefix) / "Lib/site-packages/nvidia").glob("*/bin"):
    os.add_dll_directory(str(bin_dir))
    os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ['PATH']}"

import numpy as np
from faster_whisper import WhisperModel

PARAGRAPH_PAUSE = 0.7  # seconds of silence after a sentence that starts a new paragraph in the draft


def load_audio(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
        check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def clean(words):
    """Fix known Whisper errors in the word list."""
    zero = [e - s < 0.01 for _, s, e in words]
    out = []
    for i, (w, s, e) in enumerate(words):
        # Runs of zero-length words are passages that Whisper repeats but the narrator never says.
        if zero[i] and ((i > 0 and zero[i - 1]) or (i + 1 < len(words) and zero[i + 1])):
            continue
        w = re.sub("\ufffd+", "\u2014", w).replace("\"'", "'")  # broken em dashes; '"' before an opening "'"
        if w.startswith("-") and out:  # "emerald -green" -> "emerald-green"
            out[-1] = [out[-1][0] + w, out[-1][1], e]
        else:
            out.append([w, s, e])
    return out


def draft_text(words):
    paragraphs, current = [], []
    for i, (w, s, e) in enumerate(words):
        current.append(w)
        next_start = words[i + 1][1] if i + 1 < len(words) else None
        if next_start is None or (w[-1] in ".!?\"'" and next_start - e >= PARAGRAPH_PAUSE):
            paragraphs.append(" ".join(current))
            current = []
    return "\n\n".join(paragraphs) + "\n"


def main(book_dir, number):
    book_dir = Path(book_dir)
    book = json.loads((book_dir / "book.json").read_text(encoding="utf-8"))
    chapter = book["chapters"][number - 1]
    out_dir = book_dir / f"{number:02d}"
    out_dir.mkdir(exist_ok=True)

    model = WhisperModel("large-v3", device="cuda", compute_type="float16")
    segments, _ = model.transcribe(
        load_audio(chapter["audio"]), language="en", beam_size=5,
        word_timestamps=True, initial_prompt=book.get("prompt"))

    words = []
    for segment in segments:
        for w in segment.words:
            words.append([w.word.strip(), round(w.start, 2), round(w.end, 2)])
        print(f"{segment.end:8.1f}s  {segment.text.strip()[:90]}", flush=True)
    words = clean(words)

    (out_dir / "whisper.json").write_text(
        "[\n" + ",\n".join(json.dumps(w, ensure_ascii=False) for w in words) + "\n]\n", encoding="utf-8", newline="\n")
    text_path = out_dir / "text.md"
    if not text_path.exists():
        text_path.write_text(draft_text(words), encoding="utf-8", newline="\n")
    print(f"{len(words)} words -> {out_dir}")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]))
