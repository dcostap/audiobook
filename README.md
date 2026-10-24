# Audiobook reader

A static web app. It shows the text of a book and plays the narration. The current sentence and word are highlighted as the narrator reads them. Progress, settings, and saved words are kept in `localStorage`.

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
tools/build.py                books/ -> site/ (chapter JSON, chapter MP3, Spanish help, library.json)
tools/translation.py          Spanish help: splits a chapter into jobs for subagents, and checks their answers
tools/prompts/                the subagent tasks: glossary.md, translate.md, review.md
guides/translation-es.md      the style guide for the Spanish help (all books)
books/<id>/es/glossary.md     the names and terms of one book in Spanish
books/<id>/<nn>/es/           the jobs and the answers for one chapter
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

## Spanish help

Tap a word: the popup shows the unit it belongs to (a word, a phrase, or an idiom), its Spanish meaning at that place, an optional note, and the Spanish translation of the sentence. The reader is a Spanish speaker at level B2.

The bookmark in the popup saves the unit to "Mis palabras", with an optional note. A saved unit has a ring around it, in the theme's "saved" colour (`--saved`). On wide screens, its note shows in a bubble in the right margin. The "Mis palabras" page lists the saved units, newest first, with a search. Tap one to open the chapter at its place. The audio position does not change. The page also exports and imports a JSON copy, because `localStorage` is lost when the browser data is cleared.

Subagents write the help, following `guides/translation-es.md`:

1. `python tools/translation.py prep books/hp1 1` splits the chapter into jobs of about 1500 words (`--jobs N` sets the number; `--paragraphs N` makes jobs for the first N blocks only).
2. One agent writes the book glossary (`tools/prompts/glossary.md`).
3. One agent for each job writes its answer (`tools/prompts/translate.md`). It runs `python tools/translation.py check books/hp1 1 <job>` until the answer is correct.
4. A reviewer reads all the answers of the chapter and corrects them (`tools/prompts/review.md`). The reviewer also checks the chapter as a whole: the same help for the same word, one note for each idea, and *tú* or *usted*.
4. `build.py` checks the answers again and merges them. It skips an answer with errors, and a sentence whose text changed after prep.

## Commands

```
python -m venv .venv
.venv/Scripts/python -m pip install -r tools/requirements.txt
.venv/Scripts/python tools/import_text.py books/hp1    # needs pdftotext (poppler)
.venv/Scripts/python tools/transcribe.py books/hp1 1   # needs an NVIDIA GPU
.venv/Scripts/python tools/retime.py books/hp1 1
.venv/Scripts/python tools/build.py                     # needs ffprobe
npx http-server site -c-1                               # local preview; the server must support Range requests
```

If a book has no text source, `transcribe.py` writes a first draft of `text.md` from Whisper.
