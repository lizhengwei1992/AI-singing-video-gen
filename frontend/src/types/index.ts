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

export interface VideoGenConfig {
  // 视频生成模式
  mode: 'single_image' | 'first_last_frame'
  // 输出视频名称
  outputName: string
  // 正向提示词
  positivePrompt: string
  // 反向提示词
  negativePrompt: string
  // 视频长度（帧数）
  videoLength: number
  // 是否需要超分
  needUpscale: boolean
  // 单图生视频：单张图片路径
  singleImage?: string
  // 首尾帧生视频：首帧图片路径
  firstFrameImage?: string
  // 首尾帧生视频：尾帧图片路径
  lastFrameImage?: string
}

export interface ImageGenConfig {
  // 功能模式
  mode: 'image_to_prompt' | 'image_to_storyboard'
  // 图生提示词配置
  imageToPrompt?: {
    image?: string
    prompt: string
    generatedPrompt?: string
  }
  // 单图生成分镜配置
  imageToStoryboard?: {
    image?: string
    prompt: string
    outputFilename: string
    outputFiles?: string[]
  }
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
  mode?: 'generate_and_upscale' | 'upscale_only' | 'video_gen'
  output_name?: string  // video-gen任务的输出名称
  // 新增：任务日志
  logs?: TaskLog[]
}

export interface TaskLog {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  details?: Record<string, any>
}