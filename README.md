# Life RPG

Keuangan (dan nanti kesehatan) jadi game pixel-art: hero naik level, kena damage, lawan boss tiap siklus gajian.

- **Frontend**: file statis di repo ini, di-host GitHub Pages. Tanpa build step.
- **Backend & data**: Google Sheet "Financial Planner" + Apps Script (`doPost` API). Data keuangan tidak pernah disimpan di repo ini.
- **Akses**: semua panggilan API butuh kunci yang dibuat dari app lama (Pengaturan → Life RPG). Kunci disimpan di perangkat (localStorage).

## Struktur
- `js/game.js` — aturan game (XP, HP, gold, quest, boss, tantangan). Semua dihitung ulang dari data, tidak ada state tersembunyi.
- `js/fin.js` — hitungan keuangan (saldo, siklus, format Rupiah).
- `js/sprites.js` — pixel art (digambar sendiri, palet Sweetie 16).
- `js/app.js` — tampilan.
- `js/config.js` — URL deployment API Apps Script.
