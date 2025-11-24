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

class TaskInfo(BaseModel):
    audio: str
    image: str
    index: int

class TaskConfig(BaseModel):
    segmentDuration: int = Field(default=30, ge=10, le=120)
    outputPrefix: str = Field(default="my_video", min_length=1, max_length=50)
    prompt: str = Field(default="A person is singing | A person sings freely, changing body movements and expressions with the rhythm of the music | A person is singing")
    imageAudioMapping: Dict[str, str] = Field(default_factory=dict)

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
    segment_duration: Optional[int] = None  # 音频分割时长
    output_prefix: Optional[str] = None  # 输出文件前缀
    prompt: Optional[str] = None  # 生成提示词
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