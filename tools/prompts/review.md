# Task: review the Spanish help of one chapter

The translation agents wrote one answer file for each job. Each agent saw only its own job. You review all the answers of the chapter, and you correct them. You are the last step before the reader.

## Read

1. `guides/translation-es.md`: the style guide. The answers must follow it.
2. `books/<id>/es/glossary.md`: the names and terms of this book.
3. `books/<id>/<nn>/text.md`: the full chapter.
4. `books/<id>/<nn>/es/NN.json`: the answers, one for each job. `es/source.json` has the sentences and the job ranges.
5. The reply of each translation agent: its doubts, its new terms, and the text errors it found.

## Check each answer

Read each sentence with its units. Correct what is wrong in the answer file:

- **Meaning:** a gloss or a sentence translation that is wrong for this place in the story.
- **Spanish:** words that do not sound like everyday Spanish from Spain. Sentence translations that are literal or clumsy.
- **Units:** units that are too big (a full noun phrase or clause in one unit), or idioms and phrasal verbs that are split.
- **Base forms:** missing for irregular verbs, phrasal verbs, and idioms. Present for *be, have, do* and the other common verbs. Past forms given for regular verbs.
- **Notes:** a missing note where a B2 reader would trip, such as a false friend, an idiom, or a British spelling without its US form. A note that only repeats the gloss, explains easy words, or is too long.
- **Spoilers:** anything that the story has not told the reader yet. Check names, identities, and future events.

## Check the chapter as a whole

The agents did not see each other's work. So check across all the answers:

- **Same word, same help:** the same expression has the same gloss and the same base form in all jobs, unless the meaning changes.
- **One note for each idea in a chapter:** the first appearance gets the note. Remove the repeats in later sentences.
- **Glossary:** names and terms follow the glossary. Add the new terms that the agents found to the glossary.

## Finish

1. Run `python tools/translation.py check <book> <chapter> <job>` for each job. Every job must print `OK`.
2. Run the build: `./.venv/Scripts/python tools/build.py`. It must report every sentence of the chapter in Spanish.
3. Report:
   - what you changed, grouped by kind of problem, with a few examples
   - the problems that came again and again, with a proposed change to the guide or to `tools/prompts/translate.md` for each
   - the errors in the English text that the agents found. Do not change `text.md`: a change there breaks the timings.
