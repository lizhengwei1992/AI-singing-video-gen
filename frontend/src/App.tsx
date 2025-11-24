import React, { useState, useCallback, useEffect } from 'react'
import {
  Layout,
  Button,
  Space,
  message,
  Typography,
  Divider,
  Row,
  Col,
  Card,
  Tabs
} from 'antd'
import { PlayCircleOutlined, SettingOutlined, ReloadOutlined, UploadOutlined, FileImageOutlined, SoundOutlined } from '@ant-design/icons'
import FileUpload from './components/FileUpload'
import FileManager from './components/FileManager'
import TaskConfig from './components/TaskConfig'
import TaskDetails from './components/TaskDetails'
import { WebSocketClient } from './websocket/client'
import { UploadFile, TaskConfig as TaskConfigType, TaskStatus } from './types'

const { Header, Content } = Layout
const { Title, Text } = Typography

const App: React.FC = () => {
  const [images, setImages] = useState<UploadFile[]>([])
  const [audios, setAudios] = useState<UploadFile[]>([])
  const [config, setConfig] = useState<TaskConfigType>({
    segmentDuration: 30,
    outputPrefix: 'my_video',
    prompt: 'A person is singing |A person is singing, with natural changes in expression and movement |A person is singing |A person is singing, with natural changes in expression and movement |A person is singing |A person is singing, with natural changes in expression and movement',
    imageAudioMapping: {}
  })
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null)
  const [allTasks, setAllTasks] = useState<TaskStatus[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoadingTasks, setIsLoadingTasks] = useState(false)
  const [wsClient] = useState(() => new WebSocketClient())
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [selectedAudios, setSelectedAudios] = useState<string[]>([])
  const [existingImages, setExistingImages] = useState<any[]>([])
  const [existingAudios, setExistingAudios] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('upload')

  const loadAllTasks = useCallback(async () => {
    setIsLoadingTasks(true)
    try {
      const response = await fetch('/api/batch/all-tasks')
      if (!response.ok) {
        throw new Error('获取任务列表失败')
      }
      const data = await response.json()
      setAllTasks(data.tasks || [])
    } catch (error) {
      message.error(`加载任务失败: ${error}`)
    } finally {
      setIsLoadingTasks(false)
    }
  }, [])

  // WebSocket 事件监听
  useEffect(() => {
    wsClient.on('connection', () => {
      setIsConnected(true)
      message.success('WebSocket 连接成功')
    })

    wsClient.on('disconnect', () => {
      setIsConnected(false)
      message.warning('WebSocket 连接断开')
    })

    wsClient.on('progress', (data) => {
      setTaskStatus({
        trace_id: taskStatus?.trace_id || '',
        stage: data.stage as any,
        progress: data.progress,
        completed: data.completed,
        total: data.total,
        current_task: data.current_task
      })
    })

    wsClient.on('task_start', (data) => {
      message.info(`开始处理任务: ${data.task.image} + ${data.task.audio}`)
    })

    wsClient.on('task_complete', (data) => {
      message.success(`任务完成: ${data.task.image} + ${data.task.audio}`)
    })

    wsClient.on('batch_complete', (data) => {
      setIsProcessing(false)
      setTaskStatus(prev => prev ? { ...prev, stage: 'completed', progress: 1 } : null)
      message.success(`批量处理完成！生成文件: ${data.final_videos.join(', ')}`)
      // 刷新任务列表
      loadAllTasks()
    })

    wsClient.on('error', (data) => {
      setIsProcessing(false)
      setTaskStatus(prev => prev ? { ...prev, stage: 'failed', error: data.message } : null)
      message.error(`处理错误: ${data.message}`)
    })

    return () => {
      wsClient.disconnect()
    }
  }, [wsClient, taskStatus?.trace_id, loadAllTasks])

  // 加载所有任务
  useEffect(() => {
    loadAllTasks()
  }, [loadAllTasks])

  const handleStartProcessing = useCallback(async () => {
    if (selectedImages.length === 0) {
      message.error('请至少选择一张图片')
      return
    }

    if (selectedAudios.length === 0) {
      message.error('请至少选择一个音频文件')
      return
    }

    setIsProcessing(true)
    setTaskStatus({
      trace_id: '',
      stage: 'pending',
      progress: 0,
      completed: 0,
      total: 0
    })

    try {
      const response = await fetch('/api/batch/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          images: selectedImages,
          audios: selectedAudios,
          config
        })
      })

      if (!response.ok) {
        throw new Error('提交任务失败')
      }

      const result = await response.json()
      setTaskStatus(prev => prev ? { ...prev, trace_id: result.trace_id } : null)

      // 连接 WebSocket - 异步执行，不阻塞UI
      setTimeout(() => {
        wsClient.connect(result.trace_id)
      }, 100)

      message.success('任务已提交，开始处理...')
    } catch (error) {
      setIsProcessing(false)
      setTaskStatus(null)
      message.error(`提交任务失败: ${error}`)
    }
  }, [selectedImages, selectedAudios, config, wsClient])

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Header
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '0 24px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', justifyContent: 'space-between' }}>
          <Title level={3} style={{ color: 'white', margin: 0 }}>
            🎬 AI-singing-video-gen
          </Title>
        </div>
      </Header>

      <Content style={{ padding: '24px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        <Row gutter={[24, 24]}>
          {/* 左侧：文件上传和配置 */}
          <Col xs={24} lg={10}>
            <Card
              title={
                <Space>
                  <SettingOutlined />
                  文件上传和配置
                </Space>
              }
              style={{ height: 'fit-content' }}
            >
              <Tabs activeKey={activeTab} onChange={setActiveTab}>
                <Tabs.TabPane tab={<Space><UploadOutlined />文件上传</Space>} key="upload">
                  <Space direction="vertical" style={{ width: '100%' }} size="large">
                    {/* 图片上传 */}
                    <FileUpload
                      files={images}
                      onFilesChange={setImages}
                      selectedFiles={selectedImages}
                      onSelectionChange={setSelectedImages}
                      accept="image/*"
                      maxCount={10}
                      title="上传图片"
                      description="支持 PNG、JPG 格式，最多10张图片"
                      showCheckbox={true}
                    />

                    <Divider />

                    {/* 音频上传 */}
                    <FileUpload
                      files={audios}
                      onFilesChange={setAudios}
                      selectedFiles={selectedAudios}
                      onSelectionChange={setSelectedAudios}
                      accept="audio/*"
                      maxCount={5}
                      title="上传音频"
                      description="支持 MP3、WAV 格式，最多5个音频文件"
                      showCheckbox={true}
                    />
                  </Space>
                </Tabs.TabPane>

                <Tabs.TabPane tab={<Space><FileImageOutlined />现有图片</Space>} key="existing-images">
                  <FileManager
                    fileType="images"
                    selectedFiles={selectedImages}
                    onSelectionChange={setSelectedImages}
                    onFilesChange={setExistingImages}
                  />
                </Tabs.TabPane>

                <Tabs.TabPane tab={<Space><SoundOutlined />现有音频</Space>} key="existing-audios">
                  <FileManager
                    fileType="audios"
                    selectedFiles={selectedAudios}
                    onSelectionChange={setSelectedAudios}
                    onFilesChange={setExistingAudios}
                  />
                </Tabs.TabPane>
              </Tabs>

              <Divider />

              {/* 任务配置 */}
              <TaskConfig config={config} onConfigChange={setConfig} />

              <Divider />

              {/* 开始处理按钮 */}
              <Button
                type="primary"
                size="large"
                icon={<PlayCircleOutlined />}
                onClick={handleStartProcessing}
                loading={isProcessing}
                disabled={selectedImages.length === 0 || selectedAudios.length === 0 || isProcessing}
                style={{ width: '100%', height: 48 }}
              >
                {isProcessing ? '处理中...' : '开始生成视频'}
              </Button>

              {/* 状态提示 */}
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <Text type="secondary">
                  {selectedImages.length} 张图片 + {selectedAudios.length} 个音频文件
                </Text>
              </div>
            </Card>
          </Col>

          {/* 右侧：任务详情 */}
          <Col xs={24} lg={14}>
            <TaskDetails
              tasks={allTasks}
              onRefresh={loadAllTasks}
              loading={isLoadingTasks}
              onTaskDelete={(traceId) => {
                // 如果删除的是当前正在显示的任务，清除任务状态
                if (taskStatus?.trace_id === traceId) {
                  setTaskStatus(null)
                }
              }}
            />
          </Col>
        </Row>
      </Content>

    </Layout>
  )
}

export default App