import React, { useState, useEffect } from 'react'
import { Card, List, Button, Space, Tag, Progress, message, Modal, Typography } from 'antd'
import { EyeOutlined, ReloadOutlined, HistoryOutlined } from '@ant-design/icons'
import { TaskStatus } from '../types'

interface TaskListProps {
  visible: boolean
  onClose: () => void
}

interface TaskListItemProps {
  task: TaskStatus
}

const TaskListItem: React.FC<TaskListItemProps> = ({ task }) => {
  const [showJson, setShowJson] = useState(false)

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'pending': return 'blue'
      case 'splitting': return 'orange'
      case 'processing': return 'green'
      case 'combining': return 'cyan'
      case 'completed': return 'success'
      case 'failed': return 'error'
      default: return 'default'
    }
  }

  const getStageText = (stage: string) => {
    switch (stage) {
      case 'pending': return '等待中'
      case 'splitting': return '音频分割'
      case 'processing': return '视频生成'
      case 'combining': return '视频合并'
      case 'completed': return '已完成'
      case 'failed': return '失败'
      default: return stage
    }
  }

  return (
    <Card
      size="small"
      title={`任务 ID: ${task.trace_id.slice(0, 8)}...`}
      extra={
        <Space>
          <Button size="small" onClick={() => setShowJson(!showJson)}>
            {showJson ? '隐藏JSON' : '显示JSON'}
          </Button>
          <Tag color={getStageColor(task.stage)}>
            {getStageText(task.stage)}
          </Tag>
        </Space>
      }
      style={{ width: '100%', marginBottom: 16 }}
    >
      {showJson ? (
        <pre style={{
          backgroundColor: '#f5f5f5',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '11px',
          maxHeight: '400px',
          overflow: 'auto',
          margin: 0
        }}>
          {JSON.stringify(task, null, 2)}
        </pre>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <strong>进度:</strong>
            <Progress
              percent={Math.round(task.progress * 100)}
              status={task.stage === 'failed' ? 'exception' : 'active'}
              size="small"
            />
          </div>

          {task.current_task && (
            <div>
              <strong>当前任务:</strong>
              <div style={{ fontSize: '12px', color: '#666' }}>
                图片: {task.current_task.image} | 音频: {task.current_task.audio}
              </div>
            </div>
          )}

          <div>
            <strong>完成情况:</strong>
            <span style={{ marginLeft: 8 }}>
              {task.completed} / {task.total}
            </span>
          </div>

          {task.error && (
            <div>
              <strong>错误信息:</strong>
              <div style={{ color: '#ff4d4f', fontSize: '12px' }}>
                {task.error}
              </div>
            </div>
          )}
        </Space>
      )}
    </Card>
  )
}

const TaskList: React.FC<TaskListProps> = ({ visible, onClose }) => {
  const [tasks, setTasks] = useState<TaskStatus[]>([])
  const [loading, setLoading] = useState(false)

  const fetchTasks = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/batch/all-tasks')
      if (!response.ok) {
        throw new Error('获取任务列表失败')
      }
      const result = await response.json()
      setTasks(result.tasks || [])
    } catch (error) {
      message.error(`获取任务列表失败: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (visible) {
      fetchTasks()
      // 移除自动刷新，只保留手动刷新
    }
  }, [visible])

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'pending': return 'blue'
      case 'splitting': return 'orange'
      case 'processing': return 'green'
      case 'combining': return 'cyan'
      case 'completed': return 'success'
      case 'failed': return 'error'
      default: return 'default'
    }
  }

  const getStageText = (stage: string) => {
    switch (stage) {
      case 'pending': return '等待中'
      case 'splitting': return '音频分割'
      case 'processing': return '视频生成'
      case 'combining': return '视频合并'
      case 'completed': return '已完成'
      case 'failed': return '失败'
      default: return stage
    }
  }

  return (
    <Modal
      title={
        <Space>
          <HistoryOutlined />
          任务详情
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="refresh" icon={<ReloadOutlined />} onClick={fetchTasks} loading={loading}>
          刷新
        </Button>,
        <Button key="close" onClick={onClose}>
          关闭
        </Button>
      ]}
      width={800}
    >
      <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
        {tasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
            暂无正在运行的任务
          </div>
        ) : (
          <List
            loading={loading}
            dataSource={tasks}
            renderItem={(task) => (
              <List.Item key={task.trace_id}>
                <TaskListItem task={task} />
              </List.Item>
            )}
          />
        )}
      </div>
    </Modal>
  )
}

export default TaskList