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