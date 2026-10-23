# ที่มาและสัญญาอนุญาต (NOTICE)

Makruk Learn — สื่อการสอนหมากรุกไทย จัดทำโดย **นายณัฐกมล สุนทรพิทักษ์**
ซอร์สโค้ด: <https://github.com/natstpt/makrukthai> · เว็บไซต์: <https://natstpt.github.io/makrukthai/>

## โค้ดของเว็บไซต์

โค้ดเว็บไซต์ (HTML, CSS, JavaScript, สคริปต์ และเครื่องมือในโครงการ) เผยแพร่ภายใต้
**GNU Affero General Public License v3.0** ตามไฟล์ [`LICENSE`](LICENSE)
สัญญานี้เข้ากันได้กับส่วนประกอบ GPL-3.0 และ AGPL-3.0 ด้านล่าง ผู้ที่นำไปใช้หรือแก้ไขต่อ รวมถึงเปิดให้ใช้ผ่านเครือข่าย
ต้องเปิดซอร์สโค้ดภายใต้สัญญาเดียวกัน

## ส่วนประกอบจากภายนอก

| ส่วน | ไฟล์ในโครงการ | ที่มา | สัญญาอนุญาต |
|---|---|---|---|
| AI รุ่นเต็ม · Fairy-Stockfish (WebAssembly, NNUE) | `engine/stockfish.js`, `stockfish.wasm`, `stockfish.worker.js` | แพ็กเกจ npm [`fairy-stockfish-nnue.wasm@1.1.12`](https://www.npmjs.com/package/fairy-stockfish-nnue.wasm) · ซอร์ส <https://github.com/fairy-stockfish/fairy-stockfish.wasm> | GPL-3.0 ([`engine/Copying.txt`](engine/Copying.txt), ผู้พัฒนา [`engine/AUTHORS`](engine/AUTHORS)) |
| AI รุ่นเบา · Fairy-Stockfish | `engine/lite/stockfish-lite.js`, `stockfish-lite.wasm` | สร้างจาก fairy-stockfish.wasm commit 4d4b393 แก้ด้วย [`engine/lite/single-thread.patch`](engine/lite/single-thread.patch) ด้วย `scripts/build-engine-lite.sh` | GPL-3.0 |
| ความรู้หมากรุกไทยของ AI (NNUE) | `engine/makruk-a8c621e24a8c.nnue` | [Fairy-Stockfish-NNUE release makruk-a8c621e24a8c](https://github.com/fairy-stockfish/Fairy-Stockfish-NNUE/releases/tag/makruk-a8c621e24a8c) ฝึกโดย belzedar_ | ตามโครงการต้นทาง |
| ภาพหมาก SVG · Makruk Ada | `assets/pieces/makruk/ada/` | [PyChess Variants](https://github.com/gbtami/pychess-variants) โดย gbtami (ไม่ได้แก้ไข ดู [`SOURCE.md`](assets/pieces/makruk/ada/SOURCE.md)) | AGPL-3.0 ([`UPSTREAM-LICENSE.txt`](assets/pieces/makruk/ada/UPSTREAM-LICENSE.txt)) |

รายละเอียดการสร้างและตรวจไฟล์ AI อยู่ใน [`engine/README.md`](engine/README.md)

## เขียนขึ้นเองโดยอ้างอิงแนวคิด (ไม่ได้คัดลอกโค้ด)

- `coi-sw.js` — แนวคิดจาก [coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker) (ใส่ header COOP/COEP บน GitHub Pages)
- หน้าวิเคราะห์การเดิน (โค้ช ระดับการเดิน กราฟ ลองใหม่ ทดลองเดิน) — แรงบันดาลใจจาก Chess.com Game Review
- บทเรียนทีละขั้น — แรงบันดาลใจจาก [Chess.com Learn to Play](https://www.chess.com/lessons/learn-to-play/the-king)
- หน้าตั้งหมาก — อ้างอิงแนวทาง [PyChess Makruk Editor](https://www.pychess.org/editor/makruk)
- กติกาการเดิน — อ้างอิง [PyChess Makruk](https://www.pychess.org/variants/makruk) และ [GNU XBoard Makruk rules](https://www.gnu.org/software/xboard/whats_new/rules/Makruk.html)
- ตารางท้ายเกม (`tablebase/`) — คำนวณเองด้วยสคริปต์ใน `scripts/` และ `tools/makruk-tb/`

## ไม่อยู่ใต้สัญญาอนุญาตของโค้ด

- [`assets/rules/makruk-rules-2569.pdf`](assets/rules/makruk-rules-2569.pdf) กติกาการแข่งขันหมากรุกไทย พ.ศ. 2569 — ลิขสิทธิ์ของเจ้าของต้นฉบับ ([ที่มา](assets/rules/SOURCE.md))
- [`assets/references/makruk-endgames-prakob-boonthai.pdf`](assets/references/makruk-endgames-prakob-boonthai.pdf) ตำรากลหมากรุกไทย นายแพทย์ประกอบ บุญไทย — ลิขสิทธิ์ของผู้เขียน ([ที่มา](assets/references/SOURCE.md))
- ภาพผู้จัดทำ (`assets/images/author-natkamon.png`) และภาพผู้แนะนำ — ภาพที่ผู้จัดทำส่งมาใช้ในเว็บไซต์นี้ สงวนสิทธิ์
