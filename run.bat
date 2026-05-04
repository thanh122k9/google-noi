@echo off
title Shortlink Wall Pro - Dev Environment
color 0a

if not exist "node_modules\" (
    echo [SYSTEM] Thieu node_modules. Dang tien hanh npm install...
    call npm install
)

echo [SYSTEM] Khoi chay Dev Server va tu dong mo trinh duyet...

:: Chạy ngầm bộ đếm 3 giây chờ server khởi động rồi mở web
start /B cmd /c "timeout /t 3 >nul && start http://localhost:3000"

call npm run dev