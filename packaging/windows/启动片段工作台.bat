@echo off
chcp 65001 >nul
setlocal DisableDelayedExpansion
pushd "%~dp0"
if errorlevel 1 goto incomplete
if not exist "runtime\python.exe" goto incomplete
if not exist "runtime\python313.zip" goto incomplete
if not exist "bin\ffmpeg.exe" goto incomplete
if not exist "bin\ffprobe.exe" goto incomplete
if not exist "static\index.html" goto incomplete
if not exist "docs\clip.js" goto incomplete
if not exist "app.py" goto incomplete
if not exist "start_portable.py" goto incomplete
if not exist "runtime\Lib\site-packages\yt_dlp\__init__.py" goto incomplete
set "PATH=%CD%\bin;%PATH%"
echo 正在启动片段工作台，请保持此窗口开启，不要关闭。
echo 浏览器地址：http://127.0.0.1:8765/
"%CD%\runtime\python.exe" -X utf8 -B "%CD%\start_portable.py"
echo.
echo 工作台已停止。如果窗口报错，请查看同文件夹的 startup-error.log 和使用说明.txt。
pause
popd
exit /b
:incomplete
echo 文件不全或路径无法打开。请右键 ZIP 选择「全部解压」，不要在 ZIP 预览里双击。
echo 请确认解压文件夹包含 runtime、bin、static、docs 目录，以及 app.py。
pause
exit /b 1
