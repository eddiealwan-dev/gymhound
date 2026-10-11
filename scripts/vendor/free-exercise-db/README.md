# free-exercise-db

`exercises.json` is `dist/exercises.json` from [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db)
(876 exercises), downloaded on 2026-10-11 from
`https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json`.

free-exercise-db is released under [the Unlicense](https://unlicense.org/): it is in the public domain, so GymHound may
copy, change and ship it, and its photos, without asking or crediting.

`scripts/build-library.mjs` reads this file (and downloads the photos it lists from
`https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/` into the gitignored `scripts/.cache/`) to
write `src/seed/library.generated.ts`, `src/seed/exercisePhotos.generated.ts` and `assets/exercises/`. Do not edit
`exercises.json` by hand; replace it with a newer download and run `npm run build:library`.
