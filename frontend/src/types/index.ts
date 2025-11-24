// WebSocket 事件类型
export interface WebSocketEvents {
  // 连接事件
  'connection': { trace_id: string }
  'disconnect': { reason: string }

  // 进度事件
  'progress': {
    stage: string
    progress: number
    current_task?: TaskInfo
    completed: number
    total: number
  }

  // 任务事件
  'task_start': { task: TaskInfo }
  'task_complete': { task: TaskInfo, files: string[] }
  'task_failed': { task: TaskInfo, error: string }

  // 系统事件
  'batch_complete': { final_videos: string[] }
  'error': { message: string, code: string }
}

export interface TaskInfo {
  audio: string
  image: string
  index: number
}

export interface UploadFile {
  id: string
  name: string
  type: 'image' | 'audio'
  size: number
  url?: string
  preview?: string
}

export interface TaskConfig {
  segmentDuration: number
  outputPrefix: string
  prompt: string
  imageAudioMapping: Record<string, string>
}

export interface TaskStatus {
  trace_id: string
  stage: 'pending' | 'splitting' | 'processing' | 'combining' | 'completed' | 'failed'
  progress: number
  completed: number
  total: number
  current_task?: TaskInfo
  error?: string
  // 新增：ComfyUI生成参数信息
  comfyui_params?: Record<string, any>
  input_images?: string[]
  input_audios?: string[]
  segment_duration?: number
  output_prefix?: string
  prompt?: string
  // 新增：任务日志
  logs?: TaskLog[]
}

export interface TaskLog {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  details?: Record<string, any>
}