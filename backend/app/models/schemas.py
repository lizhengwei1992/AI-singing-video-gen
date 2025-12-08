from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from enum import Enum
from datetime import datetime

class TaskStage(str, Enum):
    PENDING = "pending"
    SPLITTING = "splitting"
    PROCESSING = "processing"
    COMBINING = "combining"
    COMPLETED = "completed"
    FAILED = "failed"


class TaskMode(str, Enum):
    GENERATE_AND_UPSCALE = "generate_and_upscale"  # 先生成视频再做超分（默认）
    UPSCALE_ONLY = "upscale_only"  # 仅对已有视频做超分

class TaskInfo(BaseModel):
    audio: str
    image: str
    index: int

class TaskConfig(BaseModel):
    # 音频分割时长（仅生成模式使用）
    audioSegmentDuration: int = Field(default=30, ge=5, le=120)
    # 视频分割时长（生成模式的视频超分、仅超分模式都使用）
    videoSegmentDuration: int = Field(default=10, ge=5, le=120)
    # 兼容旧字段：如果老前端还在传 segmentDuration，则后端可将其视为 audioSegmentDuration
    segmentDuration: int = Field(default=30, ge=5, le=120)
    outputPrefix: str = Field(default="my_video", min_length=1, max_length=50)
    prompt: str = Field(default="A person is singing | A person sings freely, changing body movements and expressions with the rhythm of the music | A person is singing")
    imageAudioMapping: Dict[str, str] = Field(default_factory=dict)
    # 新增：任务模式 & 仅超分模式下的视频输入
    mode: TaskMode = Field(default=TaskMode.GENERATE_AND_UPSCALE)
    srInputVideo: Optional[str] = Field(default=None, description="仅超分模式下的输入视频路径")

class BatchSubmitRequest(BaseModel):
    images: List[str]
    audios: List[str]
    config: TaskConfig

class BatchSubmitResponse(BaseModel):
    trace_id: str
    ws_url: str

class TaskLog(BaseModel):
    timestamp: str
    level: str = Field(default="info")  # info, warn, error, debug
    message: str
    details: Optional[Dict] = None

class TaskStatus(BaseModel):
    trace_id: str
    stage: TaskStage
    progress: float = Field(ge=0, le=1)
    completed: int
    total: int
    current_task: Optional[TaskInfo] = None
    error: Optional[str] = None
    # 新增：ComfyUI生成参数信息
    comfyui_params: Optional[Dict] = None  # ComfyUI生成参数
    input_images: Optional[List[str]] = None  # 输入图片列表
    input_audios: Optional[List[str]] = None  # 输入音频列表
    segment_duration: Optional[int] = None  # 音频分割时长（兼容旧字段）
    audio_segment_duration: Optional[int] = None  # 音频分割时长
    video_segment_duration: Optional[int] = None  # 视频分割时长
    output_prefix: Optional[str] = None  # 输出文件前缀
    prompt: Optional[str] = None  # 生成提示词
    mode: Optional[TaskMode] = None  # 任务模式
    input_videos: Optional[List[str]] = None  # 输入视频（仅超分模式）
    # 新增：任务日志
    logs: Optional[List[TaskLog]] = Field(default_factory=list)  # 任务执行日志

# WebSocket 事件模型
class WebSocketMessage(BaseModel):
    event: str
    data: dict

class ConnectionEvent(BaseModel):
    trace_id: str

class DisconnectEvent(BaseModel):
    reason: str

class ProgressEvent(BaseModel):
    stage: str
    progress: float
    current_task: Optional[TaskInfo] = None
    completed: int
    total: int

class TaskStartEvent(BaseModel):
    task: TaskInfo

class TaskCompleteEvent(BaseModel):
    task: TaskInfo
    files: List[str]

class TaskFailedEvent(BaseModel):
    task: TaskInfo
    error: str

class BatchCompleteEvent(BaseModel):
    final_videos: List[str]

class ErrorEvent(BaseModel):
    message: str
    code: str