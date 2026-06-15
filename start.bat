@echo off
chcp 65001 > nul
title 브랜드 리서치 워크벤치

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js가 설치되어 있지 않습니다.
    echo https://nodejs.org/ 에서 LTS 버전을 설치한 후 다시 실행하세요.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [INFO] 처음 실행입니다. 패키지 설치 중 (1~3분 소요)...
    call npm install
    if errorlevel 1 (
        echo [ERROR] 설치 실패. 인터넷 연결을 확인하세요.
        pause
        exit /b 1
    )
)

echo.
echo ============================================================
echo   브랜드 리서치 워크벤치 시작
echo   브라우저가 곧 자동으로 열립니다 - http://localhost:3000
echo   종료: 이 창에서 Ctrl+C 또는 창 닫기
echo ============================================================
echo.

start "" http://localhost:3000
call npm run dev

pause
