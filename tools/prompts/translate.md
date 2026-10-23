# Task: translate one job of a chapter into Spanish help

A reader taps a word in the English book and sees Spanish help for it. You write that help for the sentences of one job.

## Read

1. `guides/translation-es.md`: the style guide. Follow it exactly. It tells you what a unit is, how to write a gloss, when to write a note, and how notes sound.
2. `books/<id>/es/glossary.md`: the names and terms of this book. Use them.
3. `books/<id>/<nn>/text.md`: the full chapter. Read it for context, but translate only your job.
4. `books/<id>/<nn>/es/jobs/NN.md`: your job. It has your sentences, with a number on each token.

## Write

Write the answer file that your job file names (for example `books/hp1/01/es/03.json`). It is UTF-8 JSON in this form:

```json
{
  "sentences": [
    {
      "id": 5,
      "es": "La traducción de toda la frase.",
      "units": [
        { "t": [0], "es": "él" },
        { "t": [1, 2], "es": "se despertó", "base": "wake up (woke, woken)" },
        { "t": [3, 6], "es": "aguantar", "note": "Aguantar algo molesto sin quejarse." }
      ]
    }
  ]
}
```

- `id`: the sentence number from the job file (`s5` → `5`). Give every sentence of the job, in order.
- `es`: the Spanish translation of the full sentence.
- `units`: the units of the sentence. `t` has the token numbers of the unit, in ascending order. Each token with a letter or a digit is in exactly one unit. Tokens such as "–" and "…" can stay out.
- In a unit, `es` is the gloss. `base` (the base form) and `note` are optional. Leave a key out if the unit does not need it.

## Check and improve

1. Run the check command from your job file, for example `python tools/translation.py check books/hp1 1 3`. Fix every error, and run it again until it prints `OK`.
2. Then read your answer again, sentence by sentence, against the style guide:
   - Does every gloss fit this place in the story? Does it use the words people in Spain use every day?
   - Does every unit that needs a base form have one, and only those?
   - Does each note help a B2 reader? Remove notes that only repeat the gloss or explain easy words.
   - Is there something a B2 reader would miss, with no note? Add the note.
   - Are the notes short, friendly, and in Spanish from Spain? Do they contain no spoilers?
   - Do the units follow the rules: idioms and phrasal verbs together, small words joined to their word, other words alone?
3. If you changed something, run the check again until it prints `OK`.

Do not change any other file.

## Reply

When you finish, reply with:

- the `OK` line from the check
- the names or terms that are not in the glossary, and the Spanish form you chose for each
- anything you were not sure about, in a few short lines
