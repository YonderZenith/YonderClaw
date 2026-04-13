@echo off
setlocal enabledelayedexpansion
title YonderClaw v1.0 Setup
echo.
echo   ==========================================
echo   YonderClaw v1.0 - Installer Setup
echo   by Christopher Trevethan / Yonder Zenith LLC
echo   ==========================================
echo.

REM ═══════════════════════════════════════
REM  STEP 1: GIT (required by Claude Code)
REM ═══════════════════════════════════════
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   [!] Git not found. Claude Code requires Git.
    echo   Installing Git...
    echo.
    winget install Git.Git --source winget --accept-package-agreements --accept-source-agreements 2>nul
    if %ERRORLEVEL% neq 0 (
        winget install Git.Git --accept-package-agreements --accept-source-agreements 2>nul
    )

    REM Check if Git installed
    where git >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        if exist "C:\Program Files\Git\cmd\git.exe" (
            echo   [OK] Git installed. Needs PATH reload.
            echo.
            echo   *** CLOSE this window and run setup.bat again. ***
            pause
            exit /b 0
        ) else (
            echo   [ERROR] Git installation failed.
            echo   Install manually from: https://git-scm.com/download/win
            echo   Then run setup.bat again.
            pause
            exit /b 1
        )
    )
)
echo   [OK] Git found:
call git --version
echo.

REM ═══════════════════════════════════════
REM  STEP 2: NODE.JS
REM ═══════════════════════════════════════
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   [!] Node.js not found. Installing...
    echo.
    winget install OpenJS.NodeJS.LTS --source winget --accept-package-agreements --accept-source-agreements 2>nul
    if %ERRORLEVEL% neq 0 (
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements 2>nul
    )

    set "NODEPATH=C:\Program Files\nodejs\node.exe"
    if exist "!NODEPATH!" (
        echo.
        echo   [OK] Node.js installed.
        echo.
        echo   *** CLOSE this window and run setup.bat again. ***
        pause
        exit /b 0
    ) else (
        echo   [ERROR] Node.js installation failed.
        echo   Install manually from: https://nodejs.org
        echo   Then run setup.bat again.
        pause
        exit /b 1
    )
)
echo   [OK] Node.js found:
call node --version
echo.

REM ═══════════════════════════════════════
REM  STEP 3: CLAUDE CODE
REM ═══════════════════════════════════════
set "CLAUDE_FOUND=0"
set "CLAUDE_CMD=claude"

where claude >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "CLAUDE_FOUND=1"
    set "CLAUDE_CMD=claude"
)

if "!CLAUDE_FOUND!"=="0" (
    if exist "%USERPROFILE%\.local\bin\claude.exe" (
        set "CLAUDE_FOUND=1"
        set "CLAUDE_CMD=%USERPROFILE%\.local\bin\claude.exe"
    )
)

if "!CLAUDE_FOUND!"=="0" (
    echo   [!] Claude Code not found. Installing...
    echo.
    powershell -Command "irm https://claude.ai/install.ps1 | iex" 2>nul

    if exist "%USERPROFILE%\.local\bin\claude.exe" (
        set "CLAUDE_FOUND=1"
        set "CLAUDE_CMD=%USERPROFILE%\.local\bin\claude.exe"
        echo.
        echo   [OK] Claude Code installed.
    ) else (
        echo.
        echo   [ERROR] Claude Code installation failed.
        echo   Install manually from: https://claude.ai/download
        echo   Then run setup.bat again.
        pause
        exit /b 1
    )
)

echo   [OK] Claude Code found: !CLAUDE_CMD!
echo.

REM ═══════════════════════════════════════
REM  STEP 4: CLAUDE AUTHENTICATION
REM ═══════════════════════════════════════
if not exist "%USERPROFILE%\.claude\.credentials.json" (
    echo   ==========================================
    echo   Claude Authentication Required
    echo   ==========================================
    echo.
    echo   YonderClaw needs Claude to power your agent.
    echo   You need a Claude Pro or Max subscription.
    echo.
    echo   A browser window will open - log in with your Claude account.
    echo   Once done, come back here. The installer will continue.
    echo.
    pause

    "!CLAUDE_CMD!" auth login

    if not exist "%USERPROFILE%\.claude\.credentials.json" (
        echo.
        echo   [ERROR] Authentication not detected.
        echo   Try running manually: !CLAUDE_CMD! auth login
        echo   Then run setup.bat again.
        pause
        exit /b 1
    )
)
echo   [OK] Claude authenticated.
echo.

REM ═══════════════════════════════════════
REM  STEP 5: INSTALL DEPENDENCIES
REM ═══════════════════════════════════════
echo   Installing YonderClaw dependencies...
cd /d "%~dp0"
call npm install
if %ERRORLEVEL% neq 0 (
    echo.
    echo   [ERROR] npm install failed. Check your internet connection.
    pause
    exit /b 1
)
echo.
echo   [OK] Dependencies installed.
echo.

REM ═══════════════════════════════════════
REM  STEP 6: LAUNCH INSTALLER
REM ═══════════════════════════════════════
echo   ==========================================
echo   All prerequisites ready. Launching YonderClaw...
echo   ==========================================
echo.

call npx tsx installer/index.ts

echo.
echo   Setup complete. Press any key to close.
pause >nul
