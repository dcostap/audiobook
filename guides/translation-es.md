# Style guide: Spanish help for English books

This guide applies to every book and every chapter. The book glossary (`books/<id>/es/glossary.md`) adds the names and terms of one book. If the two disagree, the glossary wins for names and terms, and this guide wins for everything else.

## The reader

- A Spanish speaker from Spain, at level B2 in English.
- They read the original English book **to learn English** first, and for pleasure second. They listen to the narration at the same time.
- They tap a word when they do not understand it, when they want to be sure, or when they are curious. They read the popup in a few seconds, and then they go back to the story.

So the help must be fast to read, exact for this place in the story, and pleasant. It teaches the English that the reader meets, a little at a time. Do not teach a lesson: one useful point is better than three.

## What the reader sees

Tap a word. The popup shows:

1. The unit that contains the word, outlined in the text. Example: "the garden".
2. The base form, if it is different from the words in the text. Example: "woke up" → *wake up (woke, woken)*.
3. The gloss: the Spanish meaning of that unit at this place. Example: *el jardín*.
4. The note, if there is one.
5. A button that shows the translation of the full sentence.

## Units

Each sentence is divided into units. Every word belongs to exactly one unit. Tokens without letters or digits ("–", "…") need no unit.

1. **One unit for an expression that has one meaning:** idioms, phrasal verbs, fixed expressions, and multi-word names.
   - "put up with" → *aguantar*
   - "out of the blue" → *de repente, sin avisar*
   - "Baker Street" → *Baker Street*
   - A unit can have gaps. In "she looked the word up", the unit is "looked … up" (tokens 1 and 4), and "the word" is a different unit.
2. **Small words join the word they belong to:** articles, auxiliaries, simple prepositions, and possessives.
   - "the garden" → *el jardín*
   - "was tired" → *estaba cansado*
   - "her coat" → *su abrigo*
3. **Other words are units of their own.** Each noun, verb, adjective, and adverb with its own meaning is a separate unit. Do not put a full noun phrase or clause into one unit.

A unit has 1 to 3 words, usually. Use a longer unit only for a fixed expression. If in doubt, split.

**Every gloss must make sense alone.** It translates only the words of its unit. Do not cut a Spanish phrase into pieces and give each piece to an English word.

- Bad: "he was hoping" as three units: "he" → *que*, "was" → *él*, "hoping" → *esperaba*. Good: one unit, *que esperaba*.
- Bad: "What's his name" as "What's" → *cómo*, "his" → *se*, "name" → *llamaba*. Good: one unit, *cómo se llama*.
- A subject pronoun that Spanish drops joins its verb: "he said" → *dijo*, "It might have been" → *podría haber sido*. Do not gloss "it" as *él* or *ella*.

Example: "He was a tall, scrawny boy with very dirty knees."

| Good units | Bad units |
|---|---|
| He was · a tall · scrawny · boy · with · very dirty · knees | He was · a tall, scrawny boy · with very dirty knees |

With the bad units, a reader who taps "scrawny" gets *un chico alto y escuálido*, and does not learn which word means *escuálido*.

## Gloss

The gloss is the meaning **at this place in the story**. It is not a dictionary entry.

- Give one meaning, or two or three if they help (best first, with a comma between them): *escuálido, flacucho*.
- Use the form that fits the sentence: "staring" → *mirando fijamente*, not *mirar fijamente*.
- Use lower case, except for names.
- Keep it short: 1 to 5 words, usually.
- For a name, the gloss is the name as the Spanish edition uses it (see the glossary). Usually it does not change.
- Use the words that people in Spain use every day. Avoid words that sound Latin American or bookish in Spain. Example: "beefy" → *grandote, corpulento*, not *fornido*.

## Base form

The base form is the form a reader looks up in a dictionary. Give it when it is different from the words in the text, so the reader learns the word, not only this form of it.

- Verbs: the infinitive without "to". Add the past forms only if they are irregular.
  - "woke up" → *wake up (woke, woken)*
  - "craning" → *crane (one's neck)*
  - "didn't hold with" → *not hold with*
  - "spent" → *spend (spent, spent)*
  - "picked out" → *pick out* (regular: no past forms)
- **No base form for the verbs that every B2 reader knows:** *be, have, do, say, go, get, make, know, see, think, come, take, give, tell, find, can, will, would*. Example: "were" and "had" get no base form. But a phrasal verb or an idiom with these verbs gets one: "found out about" → *find out about (found, found)*.
- Nouns: the singular, if the plural is irregular: "children" → *child (pl. children)*.
- Adjectives: the plain form, if the comparative or superlative is irregular or not obvious: "finer" → *fine (finer, finest)*.
- Idioms and phrasal verbs: the form a dictionary uses: "came in very useful" → *come in useful*.
- No base form for a regular plural ("neighbours"), a regular verb form that is easy ("wanted", "mixing"), or a word that is already in its base form.
- Write it in English, in lower case (except names). Do not put "to" before a verb.

## Sentence translation

- Natural Spanish from Spain: the Spanish a good Spanish translator would write. Keep the meaning and the tone of the English. Do not translate word for word, and do not follow the English word order when Spanish says it differently. The gloss and the note teach the English; the sentence translation is for the meaning.
- Write your own translation. Do not copy the published Spanish edition, but use its names and terms (see the glossary).
- Show quoted speech with « », and use the Spanish rules for punctuation.
- Put « where the English sentence opens a quote (‘), and » where it closes one (’). A quote can go over several sentences: then the first sentence has only «, and the last has only ». Example: "‘We have much to be thankful for." → *«Tenemos mucho que agradecer.*
- Keep the same *tú* or *usted* between two characters in all the chapter. The glossary says which one.

## Notes

A note tells the reader something that the gloss cannot. Most units have no note.

### When to write a note

Write a note when a B2 reader would probably miss or misread something, or when there is something useful to learn:

- **Idioms and phrasal verbs** whose meaning does not come from their words: "put up with", "come across", "out of the blue".
- **False friends:** "sensible", "actually", "eventually", "embarrassed", "involved".
- **British life and culture:** food, school, money, holidays, manners, and spellings that a Spanish reader does not know.
- **Wordplay, invented words, and names with a meaning.**
- **Register:** very informal, old-fashioned, rude, or children's words. Examples: "chuffed", "blimey", "telly".
- **Grammar that changes the meaning:** emphatic "did" ("I did warn you"), "hardly any", "would" for a habit.
- **Irony and tone,** when the reader could take the words at face value: "Oh, brilliant" after a disaster.
- **British and American English:** every British spelling or word that is different in the US, with its American form. "colour" (US *color*), "neighbour" (US *neighbor*), "grey" (US *gray*), "moustache" (US *mustache*), "flat" (US *apartment*). Learners meet both, so this is useful. Look for them in every sentence: they are easy to miss. Write a UK/US difference only if you are sure of it.
- **Useful patterns** that a learner can use again: "proud to say" (*proud to* + infinitive), "the last people you'd expect to…".
- **Spoken English in dialogue:** question tags ("wouldn't he?"), short answers ("I know you haven't"), *'d* as *would* or *had*, dropped words ("Borrowed it"), and dialect ("an'", "ter"). Dialogue needs notes as much as narration.

### When not to write a note

- The word is common, or a B2 reader knows it: "house", "quickly", "wanted".
- The gloss already says everything.
- The word looks like a Spanish word and means the same: "director", "mysterious".
- The note only explains the Spanish gloss, not the English. "high chair" → *trona* needs no note.
- The same word, name, or term already has the same note earlier **in the chapter**, also before your job. Read the chapter text before your job: if the word is there, the note is already written. Write each note one time in a chapter. Example: the first "neighbours" in the chapter gets the US spelling note; the next ones do not.

### Content

- Explain the language, not the plot.
- **No spoilers.** Never tell the reader anything that the story has not told them yet. This includes names, identities, and future events.
- One idea in each note. Start with the most useful point. Then add why, if it helps: the literal meaning, the origin, or how it sounds to a British reader.
- Do not repeat the base form in the note. The popup shows it.

### Style

- Spanish from Spain. Speak to the reader as *tú*, like a friend who knows English well and sits next to them.
- Friendly and light. A little wit is welcome, but never at the cost of clarity. Never talk down to the reader.
- 1 or 2 short sentences, at most about 200 characters.
- Put English words in italics with asterisks: *scrawny*. Put Spanish words in « ».
- Plain text only. No emojis, no lists, no headings.

### Examples

| Unit | Base | Gloss | Note |
|---|---|---|---|
| scrawny | | escuálido, flacucho | Despectivo: delgado y con poca fuerza. Más feo que *thin*. |
| put up with | | aguantar, soportar | Aguantar algo molesto sin quejarse. |
| was chuffed | be chuffed | estaba encantado | Coloquial británico: muy contento con algo. Suena cercano y desenfadado. |
| a fortnight | | quince días | Muy británico: dos semanas. Viene de *fourteen nights*. |
| did warn | warn | sí que avisé | El *did* enfático insiste: «¡pero si te avisé!». |
| brilliant | | genial | Aquí es irónico: algo acaba de salir mal. |
| eventually | | al final | Falso amigo: no es «eventualmente», sino «finalmente, con el tiempo». |
| the colour | | el color | Ortografía británica; en EE. UU., *color*. |
| ran off | run off (ran, run) | salió corriendo | |

Bad notes:

- *«Garden» significa «jardín».* This repeats the gloss.
- *Este es un ejemplo de lenguaje figurado que el autor emplea para caracterizar al personaje.* This is a lesson, and it is too long and vague.
- *Este personaje volverá a aparecer más adelante.* This tells the plot, and it is a spoiler.
