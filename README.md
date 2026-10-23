# Audiobook reader

A static web app. It shows the text of a book and plays the narration. The current sentence and word are highlighted as the narrator reads them. Progress and settings are kept in `localStorage`.

## Layout

```
books/<id>/book.json          book metadata, the source PDF, and the list of chapters (source audio paths)
books/<id>/cover.jpg
books/<id>/source/book.pdf    the book text (the same edition the narrator reads)
books/<id>/<nn>/text.md       the text the reader sees (from the book; edit this)
books/<id>/<nn>/whisper.json  what Whisper hears, with rough times (a map; generated)
books/<id>/<nn>/words.json    every token of text.md with its exact time (generated)
tools/import_text.py          book.pdf -> text.md for each chapter
tools/transcribe.py           audio -> whisper.json
tools/retime.py               text.md + whisper.json + audio -> words.json (forced aligner)
tools/build.py                books/ -> site/ (chapter JSON, .m4a audio, library.json)
site/                         the web app; GitHub Pages publishes this folder
```

## How the timing works

The book text is the truth. The timing comes from aligning the book text itself to the audio.

1. `transcribe.py` runs Whisper. Whisper's text has errors, and its word times are rough (on chapter 1 it started words 0.5 s early, by a different amount each time). That is enough for a map: which part of the text is where in the audio.
2. `retime.py` uses a forced aligner (torchaudio `MMS_FA`) to find where each word of `text.md` is spoken. It works on pieces of about 10 s. The map tells which text belongs to which piece, and each cut goes at the quietest moment of a pause. On chapter 1, 88% of the word starts are within 150 ms of the real start in the audio.

`retime.py` also prints how well the text fits the audio, for example `text matches Whisper for 97.1% of 4593 words`, and the longest unmatched stretches. A low rate or a long stretch means a wrong edition, a missing page, or narration that is not in the text.

## Editing text.md

You can edit `text.md` after `retime.py`, for example to fix a typo or split a paragraph. `build.py` then links each edited word to the nearest timed words and tells you to run `retime.py` again for exact times. `retime.py` takes about 15 s for each chapter.

Format:

- Blocks are separated by a blank line.
- A block that starts with `# ` is a heading. A block that is only `*` is a scene break. All other blocks are paragraphs.
- Sentences end at `.`, `!`, or `?` (a closing quote after them is allowed). `Mr.`, `Mrs.`, and initials such as `J.` do not end sentences.
- Add what the narrator reads that is not in the book as a heading, for example the book title before chapter 1. Then it is highlighted when it is spoken.

## Commands

```
python -m venv .venv
.venv/Scripts/python -m pip install -r tools/requirements.txt
.venv/Scripts/python tools/import_text.py books/hp1    # needs pdftotext (poppler)
.venv/Scripts/python tools/transcribe.py books/hp1 1   # needs an NVIDIA GPU
.venv/Scripts/python tools/retime.py books/hp1 1
.venv/Scripts/python tools/build.py                     # needs ffmpeg
npx http-server site -c-1                               # local preview; the server must support Range requests
```

If a book has no text source, `transcribe.py` writes a first draft of `text.md` from Whisper.
