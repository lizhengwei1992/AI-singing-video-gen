#!/bin/bash

echo "🚀 启动 WanVideo 系统..."
echo ""

BACKEND_DIR="backend"
FRONTEND_DIR="frontend"
COMFYUI_DIR="/home/lzw/project/ComfyUI"

BACKEND_PID_FILE="$BACKEND_DIR/backend.pid"
FRONTEND_PID_FILE="$FRONTEND_DIR/frontend.pid"

BACKEND_PORT=8000
FRONTEND_PORT=3000
COMFYUI_PORT=8090

TMUX_SESSION="gen_video"

##############################################
# 检查端口是否被占用
##############################################
check_port_free() {
    local port=$1
    local name=$2

    if lsof -i :$port > /dev/null 2>&1; then
        echo "❌ 端口 $port ($name) 已被占用，无法启动"
        echo "请执行: ./stop.sh"
        exit 1
    else
        echo "✅ 端口 $port ($name) 空闲"
    fi
}

##############################################
# 检查并停止已存在的tmux会话
##############################################
check_tmux_session() {
    if tmux has-session -t $TMUX_SESSION 2>/dev/null; then
        echo "ℹ️  发现已存在的tmux会话: $TMUX_SESSION"
        echo "⏹️  正在停止现有会话..."

        # 先执行stop脚本清理所有服务
        ./stop.sh

        # 确保会话被删除
        tmux kill-session -t $TMUX_SESSION 2>/dev/null || true
        sleep 2
        echo "✅ 已清理现有tmux会话"
        echo ""
    fi
}

##############################################
# 创建tmux会话和窗口
##############################################
create_tmux_session() {
    echo "🔧 创建tmux会话: $TMUX_SESSION"

    # 创建新会话，第一个窗口是comfyui
    tmux new-session -d -s $TMUX_SESSION -n "comfyui"

    # 创建额外的窗口，让tmux自动分配窗口号
    tmux new-window -t $TMUX_SESSION -n "backend"
    tmux new-window -t $TMUX_SESSION -n "frontend"

    echo "✅ tmux会话创建完成"
    echo ""
}

##############################################
# 启动ComfyUI服务
##############################################
start_comfyui() {
    echo "🎨 启动ComfyUI服务..."

    # 检查ComfyUI目录是否存在
    if [ ! -d "$COMFYUI_DIR" ]; then
        echo "❌ ComfyUI目录不存在: $COMFYUI_DIR"
        return 1
    fi
    # 在tmux第一个窗口启动ComfyUI (窗口1)
    tmux send-keys -t $TMUX_SESSION:1 "cd $COMFYUI_DIR" C-m
    tmux send-keys -t $TMUX_SESSION:1 "conda activate comfyui" C-m
    tmux send-keys -t $TMUX_SESSION:1 "python main.py --port $COMFYUI_PORT --listen" C-m

    echo "✅ ComfyUI启动命令已发送"
    echo ""
}

##############################################
# 检查服务是否已经在运行
##############################################
check_pid_running() {
    local pid_file=$1
    local name=$2

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 $pid 2>/dev/null; then
            echo "❌ $name 已在运行 (PID: $pid)"
            echo "请先执行 ./stop.sh 停止"
            exit 1
        else
            echo "ℹ️  移除无效 pid 文件: $pid_file"
            rm -f "$pid_file"
        fi
    fi
}

##############################################
# 启动后端服务
##############################################
start_backend() {
    echo "📡 启动后端服务..."

    # 检查后端目录是否存在
    if [ ! -d "$BACKEND_DIR" ]; then
        echo "❌ 后端目录不存在: $BACKEND_DIR"
        return 1
    fi

    # 在tmux第二个窗口启动后端服务 (窗口2)
    tmux send-keys -t $TMUX_SESSION:2 "cd $BACKEND_DIR" C-m
    tmux send-keys -t $TMUX_SESSION:2 "source venv/bin/activate" C-m
    tmux send-keys -t $TMUX_SESSION:2 "python main.py --port $BACKEND_PORT" C-m

    echo "✅ 后端服务启动命令已发送"
    echo ""
}

##############################################
# 启动前端服务
##############################################
start_frontend() {
    echo "🌐 启动前端服务..."

    # 检查前端目录是否存在
    if [ ! -d "$FRONTEND_DIR" ]; then
        echo "❌ 前端目录不存在: $FRONTEND_DIR"
        return 1
    fi

    # 在tmux第三个窗口启动前端服务 (窗口3)
    tmux send-keys -t $TMUX_SESSION:3 "cd $FRONTEND_DIR" C-m
    tmux send-keys -t $TMUX_SESSION:3 "npm run dev" C-m

    echo "✅ 前端服务启动命令已发送"
    echo ""
}

##############################################
# 开始执行
##############################################

echo "🔍 检查tmux会话状态..."
check_tmux_session

echo "🔍 检查服务是否已在运行..."
check_pid_running "$BACKEND_PID_FILE" "后端服务"
check_pid_running "$FRONTEND_PID_FILE" "前端服务"

echo ""
echo "🔍 检查端口状态..."
check_port_free $BACKEND_PORT "后端"
check_port_free $FRONTEND_PORT "前端"
check_port_free $COMFYUI_PORT "ComfyUI"

echo ""
echo "🔧 创建tmux会话和窗口..."
create_tmux_session

echo "🔧 启动各项服务..."
start_comfyui

# 等待ComfyUI启动
sleep 5

start_backend
start_frontend

echo "🎉 WanVideo 已成功启动!"
echo ""
echo "📌 访问前端: http://localhost:$FRONTEND_PORT"
echo "📌 后端接口: http://localhost:$BACKEND_PORT"
echo "📌 ComfyUI: http://localhost:$COMFYUI_PORT"
echo ""
echo "📋 tmux会话信息:"
echo "   会话名称: $TMUX_SESSION"
echo "   窗口1: ComfyUI (comfyui)"
echo "   窗口2: 后端服务 (backend)"
echo "   窗口3: 前端服务 (frontend)"
echo ""
echo "🔧 常用tmux命令:"
echo "   连接会话: tmux attach -t $TMUX_SESSION"
echo "   切换窗口: Ctrl+B + 窗口号 (1-3)"
echo "   列出窗口: Ctrl+B + W"
echo "   分离会话: Ctrl+B + D"
echo ""
echo "⏹ 停止系统: ./stop.sh"
echo ""