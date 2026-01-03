import React, { useState, useEffect, useMemo } from 'react'
import { Card, Collapse, Typography, Space, Tag, Button, Empty, message, Popconfirm, Pagination } from 'antd'
import { ReloadOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined, DownloadOutlined, PlayCircleOutlined } from '@ant-design/icons'

const { Text, Title } = Typography
const { Panel } = Collapse

interface TaskLog {
  timestamp: string
  level: string
  message: string
  details?: any
}

interface TaskStatus {
  trace_id: string
  stage: string
  progress: number
  completed: number
  total: number
  logs?: TaskLog[]
  error?: string
  input_images?: string[]
  input_audios?: string[]
  input_videos?: string[]
  segment_duration?: number
  output_prefix?: string
  prompt?: string
  current_task?: any
  mode?: 'generate_and_upscale' | 'upscale_only' | 'video_gen'
  output_name?: string  // video-gen任务的输出名称
}

interface TaskDetailsProps {
  tasks: TaskStatus[]
  onRefresh: () => void
  loading?: boolean
  onTaskDelete?: (traceId: string) => void
}

const TaskDetails: React.FC<TaskDetailsProps> = ({ tasks, onRefresh, loading, onTaskDelete }) => {
  const [activeKeys, setActiveKeys] = useState<string[]>([])
  const [videoGenVideos, setVideoGenVideos] = useState<Record<string, any[]>>({})
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  // 按时间排序任务，最新在最前面
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      // 从任务名称中提取时间戳，格式：YYYY-MM-DDTHH-MM-SS_xxx
      const getTimeFromName = (task: TaskStatus): number => {
        const name = task.output_name || task.output_prefix || ''
        // 尝试从名称中提取时间戳，格式：YYYY-MM-DDTHH-MM-SS
        const timeMatch = name.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/)
        if (timeMatch) {
          // 将格式转换为标准ISO格式：YYYY-MM-DDTHH:MM:SS
          const timeStr = timeMatch[1].replace(/(\d{4}-\d{2}-\d{2}T)(\d{2})-(\d{2})-(\d{2})/, '$1$2:$3:$4')
          const date = new Date(timeStr)
          if (!isNaN(date.getTime())) {
            return date.getTime()
          }
        }
        // 如果没有时间戳，从logs中获取最早的时间
        if (task.logs && task.logs.length > 0) {
          const firstLog = task.logs[0]
          const logTime = new Date(firstLog.timestamp).getTime()
          if (!isNaN(logTime)) {
            return logTime
          }
        }
        // 如果都没有，使用0作为默认值（会排到最后）
        return 0
      }
      
      const timeA = getTimeFromName(a)
      const timeB = getTimeFromName(b)
      return timeB - timeA // 降序，最新的在前
    })
  }, [tasks])

  // 分页后的任务列表
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    return sortedTasks.slice(start, end)
  }, [sortedTasks, currentPage, pageSize])

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'pending': return 'default'
      case 'splitting': return 'processing'
      case 'processing': return 'processing'
      case 'combining': return 'processing'
      case 'completed': return 'success'
      case 'failed': return 'error'
      default: return 'default'
    }
  }

  const getStageText = (stage: string) => {
    switch (stage) {
      case 'pending': return '等待开始'
      case 'splitting': return '音频分割'
      case 'processing': return '批量生成'
      case 'combining': return '视频拼接'
      case 'completed': return '任务完成'
      case 'failed': return '任务失败'
      default: return stage
    }
  }

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('zh-CN')
  }

  const loadVideoGenVideos = async (outputName: string) => {
    try {
      const response = await fetch(`/api/video-gen/videos/${encodeURIComponent(outputName)}`)
      if (!response.ok) {
        throw new Error('获取视频列表失败')
      }
      const data = await response.json()
      setVideoGenVideos(prev => ({
        ...prev,
        [outputName]: data.videos || []
      }))
    } catch (error) {
      console.error('加载视频失败:', error)
    }
  }

  useEffect(() => {
    // 为所有video-gen任务加载视频
    tasks.forEach(task => {
      if (task.stage === 'completed' && task.output_name && !videoGenVideos[task.output_name]) {
        loadVideoGenVideos(task.output_name)
      }
    })
  }, [tasks])

  const togglePanel = (key: string) => {
    setActiveKeys(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    )
  }

  const handleDeleteTask = async (traceId: string) => {
    try {
      const response = await fetch(`/api/batch/tasks/${traceId}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        throw new Error('删除任务失败')
      }
      message.success('任务删除成功')
      if (onTaskDelete) {
        onTaskDelete(traceId)
      }
      onRefresh() // 刷新任务列表
    } catch (error) {
      message.error(`删除任务失败: ${error}`)
    }
  }

  return (
    <Card
      title={
        <Space>
          <ClockCircleOutlined />
          任务详情
        </Space>
      }
      extra={
        <Button
          icon={<ReloadOutlined />}
          onClick={onRefresh}
          loading={loading}
          size="small"
        >
          刷新
        </Button>
      }
      style={{ height: '100%' }}
    >
      {sortedTasks.length === 0 ? (
        <Empty
          description="暂无任务"
          style={{ padding: '40px 0' }}
        />
      ) : (
        <>
          <Collapse
            activeKey={activeKeys}
            onChange={setActiveKeys}
            style={{ background: '#fff' }}
          >
            {paginatedTasks.map((task, index) => (
            <Panel
              key={task.trace_id}
              header={
                <Space>
                  <Text strong>
                    {task.output_name || task.output_prefix || `任务 ${task.trace_id.slice(0, 8)}`}
                  </Text>
                  <Tag color={getStageColor(task.stage)}>
                    {getStageText(task.stage)}
                  </Tag>
                  {task.stage === 'failed' && task.error && (
                    <Text type="danger" style={{ fontSize: '12px' }}>
                      {task.error}
                    </Text>
                  )}
                  {task.stage === 'completed' && (
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  )}
                </Space>
              }
              extra={
                <Space>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {Math.round(task.progress * 100)}% ({task.completed}/{task.total})
                  </Text>
                  <Popconfirm
                    title="确定要删除这个任务吗？"
                    onConfirm={() => handleDeleteTask(task.trace_id)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      size="small"
                    >
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {/* 基本信息 */}
                <div>
                  <Text strong>任务ID: </Text>
                  <Text code>{task.trace_id}</Text>
                </div>

                {/* 进度信息 */}
                <div>
                  <Text strong>进度: </Text>
                  <Text>{Math.round(task.progress * 100)}% ({task.completed}/{task.total})</Text>
                </div>

                {/* 输入文件 */}
                {task.mode && (
                  <div>
                    <Text strong>任务模式: </Text>
                    <Text code>{task.mode === 'upscale_only' ? '仅超分' : '生成 + 超分'}</Text>
                  </div>
                )}

                {task.input_images && task.input_images.length > 0 && (
                  <div>
                    <Text strong>输入图片: </Text>
                    <div style={{ marginTop: 8 }}>
                      {task.input_images.map((img, idx) => (
                        <div key={idx}>
                          <Text code style={{ fontSize: '12px' }}>
                            {img.split('/').pop()}
                          </Text>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {task.input_audios && task.input_audios.length > 0 && (
                  <div>
                    <Text strong>输入音频: </Text>
                    <div style={{ marginTop: 8 }}>
                      {task.input_audios.map((audio, idx) => (
                        <div key={idx}>
                          <Text code style={{ fontSize: '12px' }}>
                            {audio.split('/').pop()}
                          </Text>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {task.input_videos && task.input_videos.length > 0 && (
                  <div>
                    <Text strong>输入视频: </Text>
                    <div style={{ marginTop: 8 }}>
                      {task.input_videos.map((video, idx) => (
                        <div key={idx}>
                          <Text code style={{ fontSize: '12px' }}>
                            {video.split('/').pop()}
                          </Text>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 配置信息 */}
                {(task.audio_segment_duration || task.segment_duration) && (
                  <div>
                    <Text strong>音频分割时长: </Text>
                    <Text>{task.audio_segment_duration ?? task.segment_duration} 秒</Text>
                  </div>
                )}

                {task.video_segment_duration && (
                  <div>
                    <Text strong>视频分割时长: </Text>
                    <Text>{task.video_segment_duration} 秒</Text>
                  </div>
                )}

                {task.output_prefix && (
                  <div>
                    <Text strong>输出前缀: </Text>
                    <Text code>{task.output_prefix}</Text>
                  </div>
                )}

                {task.prompt && (
                  <div>
                    <Text strong>生成提示词: </Text>
                    <div style={{
                      marginTop: 8,
                      padding: '8px',
                      background: '#f5f5f5',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}>
                      <Text>{task.prompt}</Text>
                    </div>
                  </div>
                )}

                {/* 输出视频展示和下载 - AI-singing-video-gen任务 */}
                {task.stage === 'completed' && task.output_prefix && !task.output_name && task.logs && task.logs.length > 0 && (() => {
                  const reversedLogs = [...task.logs].reverse()
                  const finalLog = reversedLogs.find(
                    (log) => log.details && Array.isArray(log.details.final_videos)
                  )
                  const finalVideos: string[] = finalLog?.details?.final_videos || []

                  if (!finalVideos.length) return null

                  return (
                    <div>
                      <Text strong>输出视频下载: </Text>
                      <div style={{ marginTop: 8 }}>
                        <Space wrap>
                          {finalVideos.map((filename) => (
                            <a
                              key={filename}
                              href={`/api/videos/${encodeURIComponent(task.output_prefix!)}/${encodeURIComponent(
                                filename
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Button
                                type="default"
                                size="small"
                                icon={<DownloadOutlined />}
                                style={{ marginRight: 8 }}
                              >
                                {filename}
                              </Button>
                            </a>
                          ))}
                        </Space>
                      </div>
                    </div>
                  )
                })()}

                {/* 输出视频展示和下载 - video-gen任务 */}
                {task.stage === 'completed' && task.output_name && (() => {
                  const videos = videoGenVideos[task.output_name] || []
                  
                  if (!videos.length) {
                    // 尝试加载视频
                    if (!videoGenVideos[task.output_name]) {
                      loadVideoGenVideos(task.output_name)
                    }
                    return null
                  }

                  return (
                    <div>
                      <Text strong>生成的视频: </Text>
                      <div style={{ marginTop: 8 }}>
                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                          {videos.map((video) => (
                            <Card key={video.filename} size="small" style={{ marginBottom: 8 }}>
                              <Space direction="vertical" style={{ width: '100%' }} size="small">
                                <div>
                                  <Text strong>{video.filename}</Text>
                                  <Text type="secondary" style={{ marginLeft: 8, fontSize: '12px' }}>
                                    ({(video.size / 1024 / 1024).toFixed(2)} MB)
                                  </Text>
                                </div>
                                <video
                                  controls
                                  style={{ width: '100%', maxWidth: '600px', borderRadius: '4px' }}
                                  src={`/api/video-gen/videos/${encodeURIComponent(task.output_name!)}/${encodeURIComponent(video.filename)}`}
                                >
                                  您的浏览器不支持视频播放
                                </video>
                                <div>
                                  <a
                                    href={`/api/video-gen/videos/${encodeURIComponent(task.output_name!)}/${encodeURIComponent(video.filename)}`}
                                    download={video.filename}
                                  >
                                    <Button
                                      type="primary"
                                      size="small"
                                      icon={<DownloadOutlined />}
                                    >
                                      下载视频
                                    </Button>
                                  </a>
                                </div>
                              </Space>
                            </Card>
                          ))}
                        </Space>
                      </div>
                    </div>
                  )
                })()}

                {/* 当前任务 */}
                {task.current_task && (
                  <div>
                    <Text strong>当前任务: </Text>
                    <div style={{ marginTop: 8 }}>
                      <Text code style={{ fontSize: '12px' }}>
                        图片: {task.current_task.image}
                      </Text>
                      <br />
                      <Text code style={{ fontSize: '12px' }}>
                        音频: {task.current_task.audio}
                      </Text>
                    </div>
                  </div>
                )}

                {/* 错误信息 */}
                {task.error && (
                  <div>
                    <Text strong type="danger">错误信息: </Text>
                    <Text type="danger" style={{ fontSize: '12px' }}>
                      {task.error}
                    </Text>
                  </div>
                )}

                {/* 日志 */}
                {task.logs && task.logs.length > 0 && (
                  <div>
                    <Text strong>执行日志: </Text>
                    <div style={{
                      marginTop: 8,
                      maxHeight: '200px',
                      overflowY: 'auto',
                      background: '#f5f5f5',
                      padding: '8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontFamily: 'monospace'
                    }}>
                      {task.logs.map((log, logIndex) => (
                        <div key={logIndex} style={{ marginBottom: 4 }}>
                          <Text type="secondary" style={{ fontSize: '11px' }}>
                            [{new Date(log.timestamp).toLocaleTimeString()}]
                          </Text>
                          <Text style={{
                            marginLeft: 8,
                            color: log.level === 'error' ? '#ff4d4f' :
                                   log.level === 'warn' ? '#faad14' : '#1890ff'
                          }}>
                            {log.message}
                          </Text>
                          {log.details && (
                            <div style={{ marginLeft: 16, color: '#666' }}>
                              <Text code style={{ fontSize: '11px' }}>
                                {JSON.stringify(log.details, null, 2)}
                              </Text>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 完整JSON数据 */}
                <div>
                  <Text strong>完整任务数据 (JSON): </Text>
                  <div style={{
                    marginTop: 8,
                    maxHeight: '300px',
                    overflowY: 'auto',
                    background: '#f0f0f0',
                    padding: '8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontFamily: 'monospace'
                  }}>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(task, null, 2)}
                    </pre>
                  </div>
                </div>
              </Space>
            </Panel>
          ))}
          </Collapse>
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Pagination
              current={currentPage}
              total={sortedTasks.length}
              pageSize={pageSize}
              onChange={(page) => {
                setCurrentPage(page)
                setActiveKeys([]) // 切换页面时关闭所有展开的面板
              }}
              showSizeChanger={false}
              showTotal={(total) => `共 ${total} 个任务`}
            />
          </div>
        </>
      )}
    </Card>
  )
}

export default TaskDetails