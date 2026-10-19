# เครื่องยนต์ AI ระดับเซียน (Fairy-Stockfish + NNUE หมากรุกไทย)

ไฟล์ในโฟลเดอร์นี้ใช้กับ AI ระดับเซียนในหน้าเล่นกับ AI (`engine-ai.js` เรียกใช้ และ `coi-sw.js` เปิดให้ใช้ SharedArrayBuffer บน GitHub Pages)

| ไฟล์ | ที่มา |
|---|---|
| `stockfish.js`, `stockfish.wasm`, `stockfish.worker.js` | Fairy-Stockfish รุ่น WebAssembly จากแพ็กเกจ npm [`fairy-stockfish-nnue.wasm@1.1.12`](https://www.npmjs.com/package/fairy-stockfish-nnue.wasm) (commit b2e693ef, ซอร์สโค้ด: <https://github.com/fairy-stockfish/fairy-stockfish.wasm>) |
| `makruk-a8c621e24a8c.nnue` | โครงข่าย NNUE หมากรุกไทย จาก release [makruk-a8c621e24a8c](https://github.com/fairy-stockfish/Fairy-Stockfish-NNUE/releases/tag/makruk-a8c621e24a8c) (ฝึกโดย belzedar_, 19 ก.ย. 2022) ส่งออกจากโปรแกรม `fairy-stockfish_x86-64` ใน release นั้นด้วยคำสั่ง `export_net` |
| `lite/stockfish-lite.js`, `lite/stockfish-lite.wasm` | แบบประหยัด: Fairy-Stockfish จาก [fairy-stockfish.wasm](https://github.com/fairy-stockfish/fairy-stockfish.wasm) commit 4d4b393 แก้ให้ค้นหาบนเธรดเดียว (`lite/single-thread.patch`) สร้างด้วย emsdk 3.1.45 เป็น WebAssembly พื้นฐาน ไม่ใช้ SIMD ไม่ใช้ NNUE ไม่ต้องใช้ SharedArrayBuffer สร้างใหม่ด้วย `sh scripts/build-engine-lite.sh` |
| `lite/lite-worker.js`, `lite/preamble.js` | รันแบบประหยัดใน Web Worker และส่งคำสั่ง UCI เข้า/ออก |
| `AUTHORS`, `Copying.txt` | รายชื่อผู้พัฒนาและสัญญาอนุญาต GPL-3.0 ของ Fairy-Stockfish |

ชื่อไฟล์ NNUE คือ 12 ตัวแรกของ SHA-256 ของไฟล์ (`a8c621e24a8c…`) ตรวจด้วย `node tests/engine-files.test.cjs`

## วิธีใช้ (คำสั่ง UCI)

```
uci
setoption name UCI_Variant value makruk
setoption name EvalFile value /makruk-a8c621e24a8c.nnue
isready
position fen <FEN> moves ...
go movetime 1000
```

ต้องเขียนไฟล์ `.nnue` ลงระบบไฟล์ของ WASM ก่อน (`stockfish.FS.writeFile('/makruk-a8c621e24a8c.nnue', bytes)`) แล้วค่อยตั้ง `EvalFile` ทดสอบบน Node แล้วค้นได้ลึก 14 ชั้นในเวลาประมาณ 0.5 วินาที และขึ้น `NNUE evaluation using /makruk-a8c621e24a8c.nnue enabled`

## ข้อควรรู้ก่อนเชื่อมกับเว็บ

- รุ่น WASM นี้ใช้หลายเธรด จึงต้องมี `SharedArrayBuffer` ซึ่งเบราว์เซอร์เปิดให้เฉพาะหน้าที่เป็น cross-origin isolated (header COOP/COEP) GitHub Pages ตั้ง header เองไม่ได้ จึงต้องใช้ service worker ช่วย เช่น coi-serviceworker
- ไฟล์ NNUE ใหญ่ 47.7 MB ควรโหลดเฉพาะตอนเลือก AI ระดับเซียน และเก็บไว้ในแคชของเบราว์เซอร์
- Fairy-Stockfish ใช้สัญญาอนุญาต GPL-3.0 ต้องเก็บ `Copying.txt` และ `AUTHORS` ไว้คู่กัน และบอกแหล่งซอร์สโค้ดตามตารางด้านบน
