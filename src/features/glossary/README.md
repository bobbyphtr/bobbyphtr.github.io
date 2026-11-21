# Mandarin Glossary

A personal Mandarin word bank with pinyin and spaced-repetition review, for clinical and technical vocabulary as well as everyday Mandarin.

**Live:** https://bobbyphtr.github.io/glossary/ · sister app: [/northstar/](../northstar/README.md)

## Views

| View | What it's for |
| --- | --- |
| **Review** | Today's queue: words that are due, plus up to **15 new words per day**. You see the 漢字 and try to recall the pinyin and meaning, then press **Show answer** (Space) and rate yourself **Again / Hard / Good / Easy** (keys 1–4). Each button shows when you'll see the word next. A tag filter lets you review one topic, e.g. *Clinical*. |
| **Words** | Search, filter by tag, edit any field inline (tags are comma-separated), see each word's next review, delete, or add one word by hand. |
| **Import** | Paste a markdown table to add many words at once. |

## Adding words with an AI tool

1. **Import → Copy AI prompt.** Paste the prompt into your AI tool and replace the placeholder with a topic or your notes, e.g. a project meeting, a lecture or a FHIR spec page.
2. Paste the table it returns into the Import box. The expected format:

   ```markdown
   | Word | Pinyin | Meaning | Tags |
   | --- | --- | --- | --- |
   | 轉診 | zhuǎnzhěn | Referral | Clinical |
   | 檢傷分類 | jiǎnshāng fēnlèi | Triage | Clinical, Emergency |
   ```

3. Check the preview, which labels each row **new / updated / unchanged** and lists any skipped lines with the reason. Then press **Import**.

Import details:
- Header names are matched loosely (e.g. *Term*, *漢字*, *English*, *Definition*, *Topic*). Text before or after the table is ignored.
- If a table has no recognised header, columns are read in order: Word, Pinyin, Meaning, Tags.
- A word that already exists is **updated in place**, so it keeps its review history.

## How review scheduling works

The scheduler is a simplified SM-2, the algorithm behind Anki. Each word has an *interval* (days until the next review) and an *ease* (starts at 2.5):

| Rating | Effect |
| --- | --- |
| Again | Back into today's session; interval resets; ease −0.2 |
| Hard | Interval × 1.2; ease −0.15 |
| Good | 1 day → 3 days → interval × ease |
| Easy | Interval × ease × 1.3 (always longer than Good); ease +0.15 |

A word counts as **learned** once its interval reaches 21 days.

## Data & sync

Data is saved to this browser's `localStorage` (key `bobby_glossary_v1`). The sidebar has Export/Import JSON (`glossary-backup-YYYY-MM-DD.json`).

To keep your iPhone and Mac in step, use **Sync settings…**. It's the same private-repo setup as North Star (the file is `glossary.json`). See [North Star → Sync with GitHub](../northstar/README.md#sync-with-github).

## Files

`GlossaryApp.astro` (page config), `glossary.css`, `glossary.js`, `default-state.json` (the six starter words). The shell, shared UI and sync come from `src/shared/app-kit/`. The build output `dist/glossary/index.html` is self-contained and works offline.
