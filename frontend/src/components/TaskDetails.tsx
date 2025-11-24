import React, { useState, useEffect } from 'react'
import { Card, Collapse, Typography, Space, Tag, Button, Empty, message, Popconfirm } from 'antd'
import { ReloadOutlined, ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined } from '@ant-design/icons'

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
  segment_duration?: number
  output_prefix?: string
  prompt?: string
  current_task?: any
}

interface TaskDetailsProps {
  tasks: TaskStatus[]
  onRefresh: () => void
  loading?: boolean
  onTaskDelete?: (traceId: string) => void
}

const TaskDetails: React.FC<TaskDetailsProps> = ({ tasks, onRefresh, loading, onTaskDelete }) => {
  const [activeKeys, setActiveKeys] = useState<string[]>([])

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
      {tasks.length === 0 ? (
        <Empty
          description="暂无任务"
          style={{ padding: '40px 0' }}
        />
      ) : (
        <Collapse
          activeKey={activeKeys}
          onChange={setActiveKeys}
          style={{ background: '#fff' }}
        >
          {tasks.map((task, index) => (
            <Panel
              key={task.trace_id}
              header={
                <Space>
                  <Text strong>任务 {task.trace_id.slice(0, 8)}</Text>
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

                {/* 配置信息 */}
                {task.segment_duration && (
                  <div>
                    <Text strong>音频分割时长: </Text>
                    <Text>{task.segment_duration} 秒</Text>
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
      )}
    </Card>
  )
}

export default TaskDetails