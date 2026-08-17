# AI-singing-video-gen

基于 [ComfyUI](https://github.com/comfyanonymous/ComfyUI) 的 AI 唱歌视频生成系统，提供 Web 界面用于上传素材、提交任务并实时查看进度，自动完成「音频分割 → 对口型视频生成 → 视频超分 → 片段拼接」的完整流水线。

## ✨ 功能特性

系统提供三大功能模块：

| 模块 | 说明 |
| --- | --- |
| **AI 唱歌视频生成**（AI-singing-video-gen） | 上传一张或多张图片 + 音频，批量生成对口型唱歌视频；支持「生成+超分」与「仅超分」两种模式 |
| **视频生成**（video-gen） | 单图生视频 / 首尾帧生视频两种模式，可配置正负向提示词、视频长度、是否超分 |
| **图像生成**（image_gen） | 图生提示词（image-to-prompt）与图生分镜（image-to-storyboard） |

其它能力：

- 🎵 基于 FFmpeg 的音频自动分割（可配置分段时长）
- 🖼️ 图片与音频的映射关系自定义（`imageAudioMapping`）
- 🔄 ComfyUI 就绪检测与自动重启
- 📡 WebSocket 实时任务进度推送（分阶段日志、进度条）
- 📁 文件上传 / 管理 / 下载（图片、音频、视频）
- 📋 任务历史查询、详情查看与删除

## 🏗️ 技术栈

- **后端**：Python + [FastAPI](https://fastapi.tiangolo.com/) + Uvicorn + WebSocket
- **前端**：React 18 + TypeScript + [Ant Design 5](https://ant.design/) + Vite 5
- **推理引擎**：ComfyUI（WanVideo 对口型生成、SeedVR2 视频超分、wav2vec2 / umt5-xxl 音频与文本编码）

## 📁 目录结构

```
AI-singing-video-gen/
├── backend/                      # 后端服务
│   ├── main.py                   # FastAPI 入口
│   ├── config.py                 # 全局配置（路径、端口、上传限制等）
│   ├── requirements.txt          # Python 依赖
│   └── app/
│       ├── api/routes.py         # REST API 路由
│       ├── models/schemas.py     # Pydantic 数据模型
│       ├── websocket/handler.py  # WebSocket 连接管理
│       └── services/
│           ├── task_manager.py   # 任务编排与状态管理
│           ├── comfyui_client.py # ComfyUI 客户端
│           └── audio_processor.py# 音频分割（FFmpeg）
├── frontend/                     # 前端服务
│   ├── src/
│   │   ├── App.tsx               # 主界面
│   │   ├── types/index.ts        # 类型定义
│   │   └── components/           # UI 组件（上传、文件管理、任务配置、进度等）
│   ├── package.json
│   └── vite.config.js            # Vite 配置（含 /api 代理）
├── workflows/                    # ComfyUI 工作流
│   ├── singvideo.json            # 唱歌视频生成工作流
│   └── SeedVR2.json              # 视频超分工作流
├── start.sh                      # 一键启动脚本（tmux）
├── stop.sh                       # 一键停止脚本
└── start_backend.py              # 后端启动入口
```

## 🚀 快速开始

### 环境要求

- Python 3.9+（建议使用 `venv`）
- Node.js 16+ 与 npm
- [FFmpeg](https://ffmpeg.org/)（音频分割依赖，`ffmpeg` 命令需在 PATH 中）
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) 已安装，并具备以下工作流所需模型/节点：
  - WanVideo 系列模型（对口型生成）
  - SeedVR2（视频超分）
  - wav2vec2、umt5-xxl 编码器

### 1. 后端

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py --port 8000
```

> 也可使用项目根目录的 `start_backend.py` 启动。

### 2. 前端

```bash
cd frontend
npm install
npm run dev        # 开发模式，默认 3000 端口
# 或
npm run build      # 生产构建，产物在 dist/
```

### 3. 一键启动（推荐）

`start.sh` 使用 tmux 同时启动 ComfyUI、后端、前端三个服务：

```bash
./start.sh
```

启动后：

- 前端界面：http://localhost:3000
- 后端接口：http://localhost:8000
- ComfyUI：http://localhost:8090

停止所有服务：

```bash
./stop.sh
```

## ⚙️ 配置说明

核心配置集中在 `backend/config.py`：

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `COMFYUI_BASE` | `/home/lzw/project/ComfyUI` | ComfyUI 安装路径 |
| `COMFYUI_HOST` / `COMFYUI_PORT` | `127.0.0.1` / `8090` | ComfyUI 服务地址 |
| `VIDEO_OUTPUT_DIR` | `/home/lzw/project/self_media/videos` | 最终视频输出目录 |
| `MAX_FILE_SIZE` | 2 GB | 单文件上传上限 |
| `TASK_TIMEOUT` | 1800 秒 | 任务超时时间 |
| `MAX_RETRY_COUNT` | 3 | 最大重试次数 |

> ⚠️ 注意：`config.py` 中的路径为硬编码的服务器绝对路径（Linux 环境），部署前请根据实际环境修改。

前端开发服务器的 `/api` 代理指向 `http://localhost:8000`，见 `frontend/vite.config.js`。

## 🔌 API 概览

所有接口挂载在 `/api` 前缀下：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/upload` | 上传文件 |
| POST | `/api/batch/submit` | 提交唱歌视频批量任务 |
| GET | `/api/batch/status/{trace_id}` | 查询任务状态 |
| GET | `/api/batch/all-tasks` | 查询所有任务 |
| DELETE | `/api/batch/tasks/{trace_id}` | 删除任务 |
| GET | `/api/health` | 健康检查 |
| GET | `/api/files/images` / `audios` / `videos` | 文件列表 |
| DELETE | `/api/files/{file_type}/{filename}` | 删除文件 |
| GET | `/api/files/{file_type}/{filename}` | 获取文件 |
| GET | `/api/videos/{output_prefix}/{filename}` | 下载生成视频 |
| POST | `/api/video-gen/submit` | 提交视频生成任务 |
| POST | `/api/image-gen/image-to-prompt` | 图生提示词 |
| POST | `/api/image-gen/image-to-storyboard` | 图生分镜 |
| GET | `/api/image-gen/output/{filename}` | 获取图像生成结果 |

任务进度通过 WebSocket `ws://<host>:8000/ws/{trace_id}` 实时推送。

## 🧭 任务流程

「AI 唱歌视频生成」的典型执行流程：

1. 上传图片与音频文件
2. 配置音频分段时长、提示词、图片-音频映射、任务模式
3. 提交批量任务，获得 `trace_id`
4. 后端通过 WebSocket 推送分阶段进度：`pending → splitting → processing → combining → completed`
5. 音频按配置分段，逐段调用 ComfyUI 生成对口型视频
6. 视频片段经 SeedVR2 超分后拼接，输出最终视频

## 📄 License

未指定开源协议，保留所有权利。
