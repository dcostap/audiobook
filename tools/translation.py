"""Spanish translations of a chapter, written by subagents (instructions: tools/prompts/).

Usage:
  python tools/translation.py prep books/hp1 1 [--jobs 10] [--paragraphs N] [--force]
                                                                       split the chapter into jobs
  python tools/translation.py check books/hp1 1 3                      check the answer to job 3

Files in books/<id>/<nn>/es/:
  source.json   the sentences when the jobs were made, and the sentence range of each job
  jobs/NN.md    job NN: its sentences, with a number on each token
  NN.json       the answer to job NN

An answer gives, for each sentence, a Spanish translation and units. A unit is a group of tokens
(a word, a phrase, an idiom) with its Spanish meaning in context and an optional note. Every word
token is in exactly one unit. build.py merges the answers into site/books/<id>/<nn>.es.json.
"""
import argparse
import json
import re
import sys
from pathlib import Path

from build import parse

SENTENCE_KEYS = {"id", "es", "units"}
UNIT_KEYS = {"t", "es", "note"}


def is_word(token):
    """True if the token has a letter or a digit. Tokens such as "–" and "…" need no unit."""
    return bool(re.search(r"[^\W_]", token))


def chapter_sentences(chapter_dir):
    """The sentences of text.md in reading order, as (paragraph number, tokens)."""
    blocks = parse((chapter_dir / "text.md").read_text(encoding="utf-8"))
    return [(b, s) for b, block in enumerate(blocks) for s in block["sentences"]]


def check(answer, sentences, first, last):
    """Return a list of errors in the answer to the job with sentences first..last (an empty list if it is correct)."""
    if not isinstance(answer, dict) or set(answer) != {"sentences"} or not isinstance(answer["sentences"], list):
        return ['the file must be one object: {"sentences": [...]}']
    errors = []
    ids = [s.get("id") if isinstance(s, dict) else None for s in answer["sentences"]]
    if ids != list(range(first, last + 1)):
        errors.append(f"the sentence ids must be {first} to {last}, in order, each one time; found {ids}")
    for s in answer["sentences"]:
        if not isinstance(s, dict) or not isinstance(s.get("id"), int) or not first <= s["id"] <= last:
            continue
        where, tokens = f"s{s['id']}", sentences[s["id"]][1]
        if set(s) != SENTENCE_KEYS:
            errors.append(f"{where}: the keys must be {sorted(SENTENCE_KEYS)}; found {sorted(s)}")
        if not isinstance(s.get("es"), str) or not s["es"].strip():
            errors.append(f'{where}: "es" (the sentence translation) must be a non-empty string')
        units = s.get("units")
        if not isinstance(units, list):
            errors.append(f'{where}: "units" must be a list')
            continue
        owner = {}
        for u, unit in enumerate(units):
            at = f"{where} unit {u}"
            if not isinstance(unit, dict) or not {"t", "es"} <= set(unit) <= UNIT_KEYS:
                errors.append(f'{at}: a unit is {{"t": [...], "es": "...", "note": "..." (optional)}}; found {unit}')
                continue
            t = unit["t"]
            if not isinstance(t, list) or not t or not all(isinstance(i, int) for i in t) or t != sorted(set(t)):
                errors.append(f'{at}: "t" must be a non-empty list of token numbers, ascending, without repeats; found {t}')
                continue
            for i in t:
                if not 0 <= i < len(tokens):
                    errors.append(f"{at}: token {i} does not exist (the sentence has tokens 0 to {len(tokens) - 1})")
                elif i in owner:
                    errors.append(f'{at}: token {i} "{tokens[i]}" is also in unit {owner[i]}')
                else:
                    owner[i] = u
            if not isinstance(unit["es"], str) or not unit["es"].strip():
                errors.append(f'{at}: "es" must be a non-empty string')
            if "note" in unit and (not isinstance(unit["note"], str) or not unit["note"].strip()):
                errors.append(f'{at}: "note" must be a non-empty string; leave it out if there is no note')
        for i, token in enumerate(tokens):
            if is_word(token) and i not in owner:
                errors.append(f'{where}: token {i} "{token}" is in no unit')
    return errors


def load_source(chapter_dir):
    return json.loads((chapter_dir / "es" / "source.json").read_text(encoding="utf-8"))


def load_answer(path):
    """The answer as JSON, or None and the error."""
    try:
        return json.loads(path.read_text(encoding="utf-8")), None
    except FileNotFoundError:
        return None, f"{path} does not exist"
    except json.JSONDecodeError as error:
        return None, f"{path} is not valid JSON: {error}"


def merge(chapter_dir):
    """The checked translations of the chapter: a list with one item (or None) for each sentence.

    Skips answers with errors, and sentences whose text changed after prep. Prints what it skipped.
    """
    sentences = chapter_sentences(chapter_dir)
    if not (chapter_dir / "es" / "source.json").exists():
        return None
    source = load_source(chapter_dir)
    merged = [None] * len(sentences)
    for job, (first, last) in enumerate(source["jobs"], 1):
        path = chapter_dir / "es" / f"{job:02d}.json"
        if not path.exists():
            continue
        answer, error = load_answer(path)
        errors = [error] if error else check(answer, [(0, t.split()) for t in source["sentences"]], first, last)
        if errors:
            print(f"  {path}: {len(errors)} errors, skipped (run: python tools/translation.py check ... {job})")
            continue
        for s in answer["sentences"]:
            i = s["id"]
            if i < len(sentences) and " ".join(sentences[i][1]) == source["sentences"][i]:
                merged[i] = {"es": s["es"], "units": s["units"]}
    changed = sum(i >= len(sentences) or " ".join(sentences[i][1]) != text for i, text in enumerate(source["sentences"]))
    if changed:
        print(f"  {changed} sentences changed after prep: they have no translation until the jobs are made again")
    return merged


def prep(book_dir, number, jobs, paragraphs, force):
    """Make the jobs. With paragraphs, the jobs cover only the first that many blocks (headings count)."""
    chapter_dir = book_dir / f"{number:02d}"
    es = chapter_dir / "es"
    answers = sorted(es.glob("[0-9][0-9].json"))
    if answers and not force:
        sys.exit(f"{es} already has answers ({len(answers)} files). Use --force to make new jobs; the old answers will not fit.")
    sentences = chapter_sentences(chapter_dir)
    covered = [s for s in sentences if paragraphs is None or s[0] < paragraphs]

    # Cut after a paragraph, when the job has its share of the words.
    total = sum(len(t) for _, t in covered)
    ranges, first, words = [], 0, 0
    for i, (paragraph, tokens) in enumerate(covered):
        words += len(tokens)
        paragraph_ends = i + 1 == len(covered) or covered[i + 1][0] != paragraph
        if paragraph_ends and (words >= total * (len(ranges) + 1) / jobs or i + 1 == len(covered)):
            ranges.append([first, i])
            first = i + 1

    (es / "jobs").mkdir(parents=True, exist_ok=True)
    for old in (es / "jobs").glob("*.md"):
        old.unlink()
    source = {"sentences": [" ".join(t) for _, t in sentences], "jobs": ranges}
    (es / "source.json").write_text(json.dumps(source, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    for job, (first, last) in enumerate(ranges, 1):
        lines = [f"# Job {job:02d}: sentences {first} to {last} of {book_dir.as_posix()} chapter {number}", "",
                 f"Answer file: {(es / f'{job:02d}.json').as_posix()}",
                 f"Check: python tools/translation.py check {book_dir.as_posix()} {number} {job}", "",
                 "A blank line separates paragraphs. Each token has its number in [brackets].", ""]
        for i in range(first, last + 1):
            if i > first and sentences[i][0] != sentences[i - 1][0]:
                lines.append("")
            lines.append(f"s{i}: " + " ".join(f"[{k}]{t}" for k, t in enumerate(sentences[i][1])))
        (es / "jobs" / f"{job:02d}.md").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
        size = sum(len(sentences[i][1]) for i in range(first, last + 1))
        print(f"job {job:02d}: sentences {first}-{last} ({last - first + 1} sentences, {size} tokens)")


def check_cmd(book_dir, number, job):
    chapter_dir = book_dir / f"{number:02d}"
    source = load_source(chapter_dir)
    if not 1 <= job <= len(source["jobs"]):
        sys.exit(f"there is no job {job}; the jobs are 1 to {len(source['jobs'])}")
    first, last = source["jobs"][job - 1]
    path = chapter_dir / "es" / f"{job:02d}.json"
    answer, error = load_answer(path)
    errors = [error] if error else check(answer, [(0, t.split()) for t in source["sentences"]], first, last)
    if errors:
        print(f"{path}: {len(errors)} errors")
        for e in errors[:60]:
            print(f"  {e}")
        if len(errors) > 60:
            print(f"  ... and {len(errors) - 60} more")
        sys.exit(1)
    units = sum(len(s["units"]) for s in answer["sentences"])
    notes = sum("note" in u for s in answer["sentences"] for u in s["units"])
    print(f"OK: {path}: {len(answer['sentences'])} sentences, {units} units, {notes} notes")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("prep")
    p.add_argument("book_dir", type=Path)
    p.add_argument("chapter", type=int)
    p.add_argument("--jobs", type=int, default=10)
    p.add_argument("--paragraphs", type=int, help="only the first N blocks of text.md (headings count)")
    p.add_argument("--force", action="store_true")
    c = sub.add_parser("check")
    c.add_argument("book_dir", type=Path)
    c.add_argument("chapter", type=int)
    c.add_argument("job", type=int)
    args = parser.parse_args()
    if args.command == "prep":
        prep(args.book_dir, args.chapter, args.jobs, args.paragraphs, args.force)
    else:
        check_cmd(args.book_dir, args.chapter, args.job)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
