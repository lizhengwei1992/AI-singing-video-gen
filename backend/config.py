import os
from pathlib import Path

class Config:
    # ComfyUI 路径（固定）
    COMFYUI_BASE = "/home/lzw/project/ComfyUI"
    COMFYUI_INPUT = f"{COMFYUI_BASE}/input"
    COMFYUI_OUTPUT = f"{COMFYUI_BASE}/output"

    # 最终视频输出路径
    VIDEO_OUTPUT_DIR = "/home/lzw/project/self_media/videos"

    # 项目路径
    PROJECT_BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    TASK_STATUS = f"{PROJECT_BASE}/task_status"
    TEMP_FILES = f"{PROJECT_BASE}/temp"
    WORKFLOW_PATH = f"{PROJECT_BASE}/workflows"

    # ComfyUI API 配置
    COMFYUI_HOST = "127.0.0.1"
    COMFYUI_PORT = 8090
    COMFYUI_URL = f"http://{COMFYUI_HOST}:{COMFYUI_PORT}"

    # WebSocket 配置
    WS_HEARTBEAT_INTERVAL = 30  # 心跳间隔(秒)
    WS_RECONNECT_TIMEOUT = 5   # 重连超时(秒)

    # 文件上传配置
    MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024  # 2GB
    ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/jpg"]
    ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/x-wav"]
    ALLOWED_VIDEO_TYPES = ["video/mp4", "video/x-m4v", "video/quicktime"]

    # 任务配置
    MAX_RETRY_COUNT = 3
    TASK_TIMEOUT = 1800  # 30分钟

    @classmethod
    def ensure_directories(cls):
        """确保所有必要的目录存在"""
        directories = [
            cls.TASK_STATUS,
            cls.TEMP_FILES,
            f"{cls.COMFYUI_INPUT}/uploaded_images",
            f"{cls.COMFYUI_INPUT}/uploaded_audios",
            f"{cls.COMFYUI_INPUT}/uploaded_videos",
            f"{cls.COMFYUI_INPUT}/temp_audio_segments",
            cls.VIDEO_OUTPUT_DIR
        ]

        for directory in directories:
            Path(directory).mkdir(parents=True, exist_ok=True)