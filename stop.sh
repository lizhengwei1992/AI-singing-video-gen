#!/bin/bash

echo "🛑 停止 WanVideo 系统..."
echo ""

BACKEND_PID_FILE="backend/backend.pid"
FRONTEND_PID_FILE="frontend/frontend.pid"

##############################################
# 停止服务函数（根据 PID 文件）
##############################################
stop_by_pid() {
    local name="$1"
    local pid_file="$2"

    if [ ! -f "$pid_file" ]; then
        echo "ℹ️  $name: 无 PID 文件（可能未启动或已被终止）"
        return 1
    fi

    local pid=$(cat "$pid_file")

    if [ -z "$pid" ] || [ "$pid" == "" ]; then
        echo "⚠️  $name: PID 文件为空，跳过"
        return 1
    fi

    if ! kill -0 $pid 2>/dev/null; then
        echo "ℹ️  $name: PID $pid 已不存在"
        rm -f "$pid_file"
        return 1
    fi

    echo "⏹️  停止 $name (PID: $pid)..."
    kill $pid 2>/dev/null
    sleep 1

    # 如果仍存活，强杀
    if kill -0 $pid 2>/dev/null; then
        echo "⚠️  $name 未停止，执行强制终止..."
        kill -9 $pid 2>/dev/null
        sleep 1
    fi

    # 最终检查
    if kill -0 $pid 2>/dev/null; then
        echo "❌ $name: 停止失败，请手动处理"
    else
        echo "✅ $name 已停止"
        rm -f "$pid_file"
    fi

    echo ""
}

##############################################
# 强制杀掉占用端口的进程
##############################################
kill_port() {
    local port=$1
    local name=$2
    local pids=$(lsof -ti :$port)

    if [ -z "$pids" ]; then
        echo "ℹ️  端口 $port ($name) 没有进程占用"
        return
    fi

    echo "🔫 强制终止占用端口 $port ($name) 的进程: $pids"
    kill -9 $pids 2>/dev/null
    sleep 1

    if lsof -ti :$port > /dev/null; then
        echo "❌ 端口 $port 清理失败，请手动检查"
    else
        echo "✅ 端口 $port 已释放"
    fi
    echo ""
}

##############################################
# 停止后端服务
##############################################

stop_by_pid "后端服务" "$BACKEND_PID_FILE"
kill_port 8000 "后端服务"

##############################################
# 停止前端服务
##############################################

stop_by_pid "前端服务" "$FRONTEND_PID_FILE"
kill_port 3000 "前端服务"

##############################################
# 停止ComfyUI服务（端口8090）
##############################################

echo "🛑 停止ComfyUI服务..."
kill_port 8090 "ComfyUI服务"

##############################################
# 停止tmux会话
##############################################

echo "🛑 停止tmux会话..."
if tmux has-session -t gen_video 2>/dev/null; then
    echo "⏹️  停止tmux会话 gen_video..."
    tmux kill-session -t gen_video
    echo "✅ tmux会话 gen_video 已停止"
else
    echo "ℹ️  tmux会话 gen_video 不存在"
fi
echo ""

##############################################
# 清理临时目录
##############################################

echo "🧹 清理临时文件..."
if [ -d "backend/temp" ]; then
    rm -rf backend/temp/*
    echo "✅ 临时文件已清空"
else
    echo "ℹ️  无临时目录"
fi
echo ""

##############################################
# 最终状态确认
##############################################

echo "🔍 最终检查:"

if lsof -i :8000 > /dev/null; then
    echo "❌ 后端端口 8000 仍被占用!"
else
    echo "✅ 后端端口 8000 空闲"
fi

if lsof -i :3000 > /dev/null; then
    echo "❌ 前端端口 3000 仍被占用!"
else
    echo "✅ 前端端口 3000 空闲"
fi

if lsof -i :8090 > /dev/null; then
    echo "❌ ComfyUI端口 8090 仍被占用!"
else
    echo "✅ ComfyUI端口 8090 空闲"
fi

echo ""
echo "🎉 系统已安全停止"
echo ""