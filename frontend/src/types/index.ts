export interface TaskInfo {
  audio: string
  image: string
  index: number
}

export interface UploadFile {
  id: string
  name: string
  type: 'image' | 'audio' | 'video'
  size: number
  url?: string
  preview?: string
}

export interface TaskConfig {
  // 音频分割时长（生成模式）
  audioSegmentDuration: number
  // 视频分割时长（生成模式的视频超分 & 仅超分模式）
  videoSegmentDuration: number
  // 兼容旧字段
  segmentDuration?: number
  outputPrefix: string
  prompt: string
  imageAudioMapping: Record<string, string>
  mode: 'generate_and_upscale' | 'upscale_only'
  srInputVideo?: string
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
  input_videos?: string[]
  segment_duration?: number
  output_prefix?: string
  prompt?: string
  mode?: 'generate_and_upscale' | 'upscale_only'
  // 新增：任务日志
  logs?: TaskLog[]
}

export interface TaskLog {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  details?: Record<string, any>
}