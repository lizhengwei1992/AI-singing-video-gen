import React, { useState } from 'react'
import { Card, Progress, Steps, Tag, Space, Typography, List, Collapse, Button } from 'antd'
import {
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PlayCircleOutlined,
  SoundOutlined,
  PictureOutlined,
  SettingOutlined,
  FileImageOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined as ErrorIcon
} from '@ant-design/icons'
import { TaskStatus, TaskInfo, TaskLog } from '../types'

const { Text } = Typography

interface TaskProgressProps {
  status: TaskStatus | null
  isConnected: boolean
}

const TaskProgress: React.FC<TaskProgressProps> = ({ status, isConnected }) => {
  const [showParams, setShowParams] = useState(false)

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'info': return <InfoCircleOutlined style={{ color: '#1890ff' }} />
      case 'warn': return <WarningOutlined style={{ color: '#faad14' }} />
      case 'error': return <ErrorIcon style={{ color: '#ff4d4f' }} />
      case 'debug': return <LoadingOutlined style={{ color: '#722ed1' }} />
      default: return <InfoCircleOutlined />
    }
  }

  const getLogColor = (level: string) => {
    switch (level) {
      case 'info': return '#1890ff'
      case 'warn': return '#faad14'
      case 'error': return '#ff4d4f'
      case 'debug': return '#722ed1'
      default: return '#666'
    }
  }

  const getStageSteps = () => {
    const stages = [
      { key: 'pending', title: '等待开始', icon: <LoadingOutlined /> },
      { key: 'splitting', title: '音频分割', icon: <SoundOutlined /> },
      { key: 'processing', title: '批量生成', icon: <PlayCircleOutlined /> },
      { key: 'combining', title: '视频拼接', icon: <PictureOutlined /> },
      { key: 'completed', title: '任务完成', icon: <CheckCircleOutlined /> }
    ]

    let current = 0
    if (status) {
      switch (status.stage) {
        case 'splitting':
          current = 1
          break
        case 'processing':
          current = 2
          break
        case 'combining':
          current = 3
          break
        case 'completed':
          current = 4
          break
        case 'failed':
          current = -1
          break
        default:
          current = 0
      }
    }

    return {
      current,
      items: stages.map(stage => ({
        key: stage.key,
        title: stage.title,
        icon: stage.icon
      }))
    }
  }

  const { current, items } = getStageSteps()

  return (
    <Card
      title="任务日志"
      style={{ marginBottom: 24 }}
      extra={
        <Space>
          <Tag color={isConnected ? 'success' : 'error'}>
            {isConnected ? '已连接' : '未连接'}
          </Tag>
          {status && (
            <Tag color={status.stage === 'failed' ? 'error' : 'processing'}>
              {status.stage === 'failed' ? '失败' : '进行中'}
            </Tag>
          )}
        </Space>
      }
    >
      {!status ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Text type="secondary">等待任务开始...</Text>
        </div>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* 阶段进度 */}
          <Steps
            current={current}
            items={items}
            status={status.stage === 'failed' ? 'error' : 'process'}
          />

          {/* 任务日志 */}
          <Card size="small" title="执行日志" style={{ backgroundColor: '#fafafa' }}>
            <div style={{
              maxHeight: '300px',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '12px',
              lineHeight: '1.5'
            }}>
              {status.logs && status.logs.length > 0 ? (
                <List
                  size="small"
                  dataSource={status.logs}
                  renderItem={(log: TaskLog) => (
                    <List.Item style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <Space>
                        {getLogIcon(log.level)}
                        <Text style={{ color: '#999', fontSize: '11px' }}>
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </Text>
                        <Text style={{ color: getLogColor(log.level), fontSize: '12px' }}>
                          {log.message}
                        </Text>
                        {log.details && Object.keys(log.details).length > 0 && (
                          <Text type="secondary" style={{ fontSize: '11px' }}>
                            {JSON.stringify(log.details)}
                          </Text>
                        )}
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                  暂无日志信息
                </div>
              )}
            </div>
          </Card>

          {/* 整体进度 */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text>整体进度</Text>
              <Text>
                {status.completed}/{status.total} ({Math.round(status.progress * 100)}%)
              </Text>
            </div>
            <Progress
              percent={Math.round(status.progress * 100)}
              status={status.stage === 'failed' ? 'exception' : 'active'}
              strokeColor={status.stage === 'failed' ? '#ff4d4f' : undefined}
            />
          </div>

          {/* 当前任务信息 */}
          {status.current_task && (
            <Card size="small" title="当前处理任务">
              <List size="small">
                <List.Item>
                  <List.Item.Meta
                    avatar={<PictureOutlined />}
                    title="图片"
                    description={status.current_task.image}
                  />
                </List.Item>
                <List.Item>
                  <List.Item.Meta
                    avatar={<SoundOutlined />}
                    title="音频"
                    description={status.current_task.audio}
                  />
                </List.Item>
                <List.Item>
                  <List.Item.Meta
                    avatar={<PlayCircleOutlined />}
                    title="序号"
                    description={`第 ${status.current_task.index} 个任务`}
                  />
                </List.Item>
              </List>
            </Card>
          )}

          {/* 错误信息 */}
          {status.error && (
            <Card size="small" type="inner" style={{ borderColor: '#ff4d4f' }}>
              <Space>
                <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                <Text type="danger">{status.error}</Text>
              </Space>
            </Card>
          )}

          {/* ComfyUI参数信息 */}
          {status && (status.input_images || status.input_audios || status.prompt) && (
            <Card size="small" title="生成参数信息" extra={<SettingOutlined />}>
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {/* 分割参数 */}
                {status.segment_duration && (
                  <div>
                    <Text strong style={{ fontSize: '12px' }}>
                      <ClockCircleOutlined /> 音频分割时长:
                    </Text>
                    <Text style={{ fontSize: '12px', marginLeft: 8 }}>
                      {status.segment_duration} 秒
                    </Text>
                  </div>
                )}

                {/* 输出前缀 */}
                {status.output_prefix && (
                  <div>
                    <Text strong style={{ fontSize: '12px' }}>
                      输出前缀:
                    </Text>
                    <Text code style={{ fontSize: '12px' }}>
                      {status.output_prefix}
                    </Text>
                  </div>
                )}

                {/* 提示词 */}
                {status.prompt && (
                  <div>
                    <Text strong style={{ fontSize: '12px' }}>
                      <FileTextOutlined /> 生成提示词:
                    </Text>
                    <div style={{
                      marginTop: 4,
                      padding: '8px',
                      background: '#f5f5f5',
                      borderRadius: '4px',
                      fontSize: '12px',
                      maxHeight: '60px',
                      overflow: 'auto'
                    }}>
                      {status.prompt}
                    </div>
                  </div>
                )}

                {/* 输入文件列表 */}
                <Collapse size="small" ghost>
                  {status.input_images && status.input_images.length > 0 && (
                    <Collapse.Panel
                      header={<span><FileImageOutlined /> 输入图片 ({status.input_images.length}张)</span>}
                      key="images"
                    >
                      <List
                        size="small"
                        dataSource={status.input_images}
                        renderItem={(image) => (
                          <List.Item style={{ padding: '4px 0', fontSize: '12px' }}>
                            <Text code style={{ fontSize: '11px' }}>
                              {image.split('/').pop()}
                            </Text>
                          </List.Item>
                        )}
                      />
                    </Collapse.Panel>
                  )}

                  {status.input_audios && status.input_audios.length > 0 && (
                    <Collapse.Panel
                      header={<span><SoundOutlined /> 输入音频 ({status.input_audios.length}个)</span>}
                      key="audios"
                    >
                      <List
                        size="small"
                        dataSource={status.input_audios}
                        renderItem={(audio) => (
                          <List.Item style={{ padding: '4px 0', fontSize: '12px' }}>
                            <Text code style={{ fontSize: '11px' }}>
                              {audio.split('/').pop()}
                            </Text>
                          </List.Item>
                        )}
                      />
                    </Collapse.Panel>
                  )}

                  {status.input_videos && status.input_videos.length > 0 && (
                    <Collapse.Panel
                      header={<span><FileImageOutlined /> 输入视频 ({status.input_videos.length}个)</span>}
                      key="videos"
                    >
                      <List
                        size="small"
                        dataSource={status.input_videos}
                        renderItem={(video) => (
                          <List.Item style={{ padding: '4px 0', fontSize: '12px' }}>
                            <Text code style={{ fontSize: '11px' }}>
                              {video.split('/').pop()}
                            </Text>
                          </List.Item>
                        )}
                      />
                    </Collapse.Panel>
                  )}
                </Collapse>
              </Space>
            </Card>
          )}
        </Space>
      )}
    </Card>
  )
}

export default TaskProgress