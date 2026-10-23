"""Time every word of text.md exactly.

Usage: python tools/retime.py books/hp1 1

Reads text.md (what the reader sees) and whisper.json (a rough map from transcribe.py).
Writes words.json: each token of text.md with its start and end time.

A forced aligner (torchaudio MMS_FA, a wav2vec2 CTC model) finds where each word of the text
is spoken. It works on pieces of about 10 s. Whisper's rough map tells which text belongs to
which piece, and each cut goes at the quietest moment of a pause.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import torch
import torchaudio

from build import align, norm, parse, tokens_of

SR = 16000
CHUNK = 8.0  # seconds: the shortest piece
PAUSE = 0.25  # seconds: the shortest gap between words where a piece can end
SEARCH = 0.75  # seconds: look this far around the gap for the quietest moment to cut
NUMBERS = {"0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six",
           "7": "seven", "8": "eight", "9": "nine", "10": "ten", "11": "eleven", "12": "twelve"}


def load_audio(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         check=True, capture_output=True).stdout
    return torch.frombuffer(bytearray(raw), dtype=torch.float32)


def spoken(token):
    """The letters the aligner can hear for a token, or "" if it has none."""
    t = token.lower().replace("’", "'")
    digits = re.sub(r"[^0-9]", "", t)
    if digits and not re.search(r"[a-z]", t):
        return NUMBERS.get(digits, "")
    return re.sub(r"[^a-z']", "", t).strip("'")


def quietest(loudness, start, end):
    """The time of the quietest 10 ms frame between start and end (seconds)."""
    a, b = max(0, int(start * 100)), min(len(loudness), int(end * 100) + 1)
    return (a + int(torch.argmin(loudness[a:b]))) / 100 if b > a else start


def pieces(times, matched, loudness, duration):
    """Split the tokens at pauses between matched words. Yield (first, last + 1, audio start, audio end)."""
    first, start = 0, 0.0
    for i in range(1, len(times)):
        gap_start, gap_end = times[i - 1][1], times[i][0]
        if matched[i - 1] and matched[i] and gap_end - gap_start >= PAUSE and gap_start - start >= CHUNK:
            middle = (gap_start + gap_end) / 2
            cut = quietest(loudness, middle - SEARCH, middle + SEARCH)
            yield first, i, start, cut
            first, start = i, cut
    yield first, len(times), start, duration


def report(tokens, times, matched):
    """How well the text fits Whisper's words: a low match rate or a long unmatched stretch needs a look."""
    words = [i for i, t in enumerate(tokens) if norm(t)]
    rate = sum(matched[i] for i in words) / len(words)
    stretches, run = [], []
    for i in words + [None]:
        if i is not None and not matched[i]:
            run.append(i)
        elif run:
            stretches.append((times[run[-1]][1] - times[run[0]][0], run))
            run = []
    print(f"text matches Whisper for {rate:.1%} of {len(words)} words")
    for seconds, run in sorted(stretches, reverse=True)[:3]:
        at = times[run[0]][0]
        print(f"  {seconds:4.1f} s unmatched at {int(at // 60)}:{at % 60:04.1f}: {' '.join(tokens[i] for i in run)[:80]}")


def main(book_dir, number):
    book_dir = Path(book_dir)
    book = json.loads((book_dir / "book.json").read_text(encoding="utf-8"))
    chapter_dir = book_dir / f"{number:02d}"
    tokens = tokens_of(parse((chapter_dir / "text.md").read_text(encoding="utf-8")))
    whisper = json.loads((chapter_dir / "whisper.json").read_text(encoding="utf-8"))
    times, matched = align(tokens, whisper)
    report(tokens, times, matched)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=False).to(device)
    tokenizer, aligner = bundle.get_tokenizer(), bundle.get_aligner()
    audio = load_audio(book["chapters"][number - 1]["audio"])
    frames = audio[: len(audio) // 160 * 160].view(-1, 160)
    loudness = frames.pow(2).mean(dim=1)  # 10 ms frames

    failed = 0
    for i1, i2, a, b in pieces(times, matched, loudness, len(audio) / SR):
        index = [i for i in range(i1, i2) if spoken(tokens[i])]
        clip = audio[int(a * SR):int(b * SR)]
        with torch.inference_mode():
            emission, _ = model(clip[None].to(device))
        emission = emission.cpu()  # torchaudio's forced_align runs on the CPU only
        try:
            spans = aligner(emission[0], tokenizer([spoken(tokens[i]) for i in index]))
        except RuntimeError as error:  # the text does not fit the audio: keep the rough times
            failed += 1
            print(f"{a:7.1f}s: kept rough times ({error})")
            continue
        seconds = clip.numel() / emission.size(1) / SR
        for i, word_spans in zip(index, spans):
            times[i] = (a + word_spans[0].start * seconds, a + word_spans[-1].end * seconds)
        # Tokens without letters ("–", "…") sit between their neighbours.
        for i in range(i1, i2):
            if not spoken(tokens[i]):
                before = times[i - 1][1] if i > 0 else a
                after = next((times[j][0] for j in range(i + 1, i2) if spoken(tokens[j])), before)
                times[i] = (before, max(before, after))

    words = [[t, round(s, 2), round(e, 2)] for t, (s, e) in zip(tokens, times)]
    (chapter_dir / "words.json").write_text(
        "[\n" + ",\n".join(json.dumps(w, ensure_ascii=False) for w in words) + "\n]\n", encoding="utf-8", newline="\n")
    print(f"{len(words)} words timed -> {chapter_dir / 'words.json'}" + (f" ({failed} pieces kept rough times)" if failed else ""))


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]))
