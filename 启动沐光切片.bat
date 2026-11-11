@echo off
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
  echo 没有找到 Python。请先安装 Python 3.10 或更高版本，安装时勾选 Add python.exe to PATH。
  echo 说明见 docs\windows-guide.md
  pause
  exit /b 1
)

python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"
if errorlevel 1 (
  echo 需要 Python 3.10 或更高版本。
  pause
  exit /b 1
)

if not exist ".venv" (
  echo 正在创建本地环境…
  python -m venv .venv
  if errorlevel 1 (
    echo 创建虚拟环境失败。
    pause
    exit /b 1
  )
)

call .venv\Scripts\activate.bat
python -m pip install -q --upgrade pip
python -m pip install -q -r requirements.txt
if errorlevel 1 (
  echo 安装依赖失败，请检查网络后重试。
  pause
  exit /b 1
)

where ffmpeg >nul 2>&1
if errorlevel 1 (
  echo 没有找到 FFmpeg。请安装并把 ffmpeg.exe 所在的 bin 目录加入系统 PATH，然后重新打开这个脚本。
  echo 说明见 docs\windows-guide.md
  pause
  exit /b 1
)

echo 正在启动沐光切片…
python app.py
pause
