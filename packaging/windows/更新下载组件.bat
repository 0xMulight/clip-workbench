@echo off
chcp 65001 >nul
setlocal DisableDelayedExpansion
pushd "%~dp0"
if errorlevel 1 goto incomplete
if not exist "runtime\python.exe" goto incomplete
if not exist "update_downloader.py" goto incomplete
echo 此操作只更新这个文件夹内的 yt-dlp，不修改系统。请先关闭工作台窗口。
"%CD%\runtime\python.exe" -X utf8 -B "%CD%\update_downloader.py"
pause
popd
exit /b
:incomplete
echo 文件不全，请先将 ZIP 全部解压，再双击此文件。
pause
exit /b 1
