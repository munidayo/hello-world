@echo off
REM DocxPeek 起動スクリプト (Windows)
REM 使い方: start.bat をダブルクリック
REM ポート変更: SET PORT=9000 ^&^& start.bat

setlocal
if "%PORT%"=="" set PORT=8000
set URL=http://localhost:%PORT%/

cd /d "%~dp0"

echo.
echo  +------------------------------------------+
echo  ^|  DocxPeek                                ^|
echo  ^|  %URL%                                   ^|
echo  ^|  Ctrl+C で停止                           ^|
echo  +------------------------------------------+
echo.

REM 1秒後にブラウザを開く（サーバ起動待ち）
start /b cmd /c "timeout /t 1 /nobreak >nul && start "" "%URL%""

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -m http.server %PORT%
  goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server %PORT%
  goto :eof
)

where npx >nul 2>nul
if %errorlevel%==0 (
  npx --yes serve -l %PORT% .
  goto :eof
)

where php >nul 2>nul
if %errorlevel%==0 (
  php -S localhost:%PORT%
  goto :eof
)

echo エラー: Python / Node.js (npx) / PHP のいずれかが必要です。
echo         どれかひとつインストールしてから再実行してください。
pause
exit /b 1
