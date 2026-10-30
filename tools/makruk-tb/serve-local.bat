@echo off
rem One click (double-click this file): the endgame-table server on this computer (makruk-tb serve, port 8765), the
rem website at http://localhost:8000 (the page uses the local tables only when opened from localhost), and the browser.
rem Whatever is already running is left as it is. Close the two windows it opens to stop.
chcp 65001 >nul
cd /d "%~dp0"

if not exist "target\release\makruk-tb.exe" (
  echo ไม่พบ makruk-tb.exe - กำลัง build ครั้งแรก ^(cargo build --release^) ...
  cargo build --release
  if errorlevel 1 (
    echo build ไม่สำเร็จ: ต้องติดตั้ง Rust ก่อน ดู tools\makruk-tb\README.md
    pause
    exit /b 1
  )
)

netstat -ano | findstr /r /c:":8765 .*LISTENING" >nul
if errorlevel 1 (
  start "makruk-tb serve - ตารางท้ายเกม (ปิดหน้าต่างนี้เพื่อหยุด)" "target\release\makruk-tb.exe" serve
) else (
  echo ตารางท้ายเกม ^(port 8765^) เปิดอยู่แล้ว
)

netstat -ano | findstr /r /c:":8000 .*LISTENING" >nul
if errorlevel 1 (
  where python >nul 2>nul
  if errorlevel 1 (
    echo ไม่พบ python: ติดตั้ง Python เพื่อเปิดเว็บที่ http://localhost:8000
    pause
    exit /b 1
  )
  start "เว็บ localhost:8000 (ปิดหน้าต่างนี้เพื่อหยุด)" /d "%~dp0..\.." python -m http.server 8000
) else (
  echo เว็บ ^(port 8000^) เปิดอยู่แล้ว
)

timeout /t 2 /nobreak >nul
start "" "http://localhost:8000/ai/"
echo.
echo เปิดแล้ว: ตารางท้ายเกม http://127.0.0.1:8765  ·  เว็บ http://localhost:8000/ai/
echo ใช้เสร็จแล้ว ปิดหน้าต่าง "makruk-tb serve" และ "เว็บ localhost:8000"
timeout /t 6 >nul
