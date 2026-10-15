# programs

`gymhound_programs.json` is the owner's Program Library v2 (schema `gymhound-program-library`, version 2.0, generated
2026-10-14): the twenty programs, their exercise catalog, the app-wide rules and the 88 sources. It was copied byte for
byte on 2026-10-15 from the owner's hand-off folder (`.superpowers/sdd/2026-10-14-program-library-v2/`), together with
its human copy `GymHound_Workout_Program_Library_20.docx` and the build spec `GymHound_Programs_for_Claude_Code.md`
(spec §18.29, R596). SHA-256 `03f14e1cee828e4e9c2ff015d956ff14a2158548de6e89688611ce37ad607ece`.

`why-bullets.json` holds each program's "Why it works" bullets as the docx writes them (keyed by the JSON's program
id). They were extracted once from the docx (SHA-256 `4a1f493c…d010`): the numbered list paragraphs under each
"Why it works" heading of `word/document.xml`, in order, with XML entities decoded. The bullets of every program join
with single spaces into the JSON's `why_it_works` paragraph exactly; `whyBullets` in `src/seed/programMapping.ts`
checks this on every build, and `src/seed/programs.test.ts` checks it again.

`scripts/build-programs.mjs` reads both files, with the mapping in `src/seed/programMapping.ts` (catalog names to
exercise ids, ladders, custom rules, week plans, pictures, the free list), to write `src/seed/programs.generated.ts`.
Do not edit either file by hand; replace them with a newer hand-off and run `npm run build:programs`.
