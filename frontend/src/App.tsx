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
import {
  PlayCircleOutlined,
  SettingOutlined,
  UploadOutlined,
  FileImageOutlined,
  SoundOutlined,
  VideoCameraOutlined
} from '@ant-design/icons'
import FileUpload from './components/FileUpload'
import FileManager from './components/FileManager'
import TaskConfig from './components/TaskConfig'
import TaskDetails from './components/TaskDetails'
import { UploadFile, TaskConfig as TaskConfigType, TaskStatus } from './types'

const { Header, Content } = Layout
const { Title, Text } = Typography

const App: React.FC = () => {
  const [images, setImages] = useState<UploadFile[]>([])
  const [audios, setAudios] = useState<UploadFile[]>([])
  const [videos, setVideos] = useState<UploadFile[]>([])
  const [config, setConfig] = useState<TaskConfigType>({
    audioSegmentDuration: 30,
    videoSegmentDuration: 10,
    outputPrefix: 'my_video',
    prompt:
      'A person is singing |A person is singing, with natural changes in expression and movement |A person is singing |A person is singing, with natural changes in expression and movement |A person is singing |A person is singing, with natural changes in expression and movement',
    imageAudioMapping: {},
    mode: 'generate_and_upscale',
    srInputVideo: undefined
  })
  const [allTasks, setAllTasks] = useState<TaskStatus[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoadingTasks, setIsLoadingTasks] = useState(false)
  const [selectedImages, setSelectedImages] = useState<string[]>([])
  const [selectedAudios, setSelectedAudios] = useState<string[]>([])
  const [selectedVideos, setSelectedVideos] = useState<string[]>([])
  const [existingImages, setExistingImages] = useState<any[]>([])
  const [existingAudios, setExistingAudios] = useState<any[]>([])
  const [existingVideos, setExistingVideos] = useState<any[]>([])
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

  // 加载所有任务
  useEffect(() => {
    loadAllTasks()
  }, [loadAllTasks])

  const handleStartProcessing = useCallback(async () => {
    const mode = config.mode || 'generate_and_upscale'

    if (mode === 'generate_and_upscale') {
      if (selectedImages.length === 0) {
        message.error('请至少选择一张图片')
        return
      }

      if (selectedAudios.length === 0) {
        message.error('请至少选择一个音频文件')
        return
      }
    } else if (mode === 'upscale_only') {
      if (selectedVideos.length === 0) {
        message.error('仅超分模式下，请至少选择一个视频')
        return
      }
    }

    setIsProcessing(true)
    try {
      const payload =
        mode === 'generate_and_upscale'
          ? {
              images: selectedImages,
              audios: selectedAudios,
              config: {
                ...config,
                // 兼容后端旧字段，顺带填充 segmentDuration
                segmentDuration: config.audioSegmentDuration
              }
            }
          : {
              images: [],
              audios: [],
              config: {
                ...config,
                srInputVideo: selectedVideos[0]
              }
            }

      const response = await fetch('/api/batch/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error('提交任务失败')
      }

      await response.json()
      message.success('任务已提交，可在右侧任务列表中点击“刷新”查看最新进度')
      await loadAllTasks()
    } catch (error) {
      message.error(`提交任务失败: ${error}`)
    } finally {
      setIsProcessing(false)
    }
  }, [selectedImages, selectedAudios, selectedVideos, config, loadAllTasks])

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
                    {config.mode === 'generate_and_upscale' && (
                      <>
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
                      </>
                    )}

                    {config.mode === 'upscale_only' && (
                      <>
                        {/* 视频上传（仅超分模式） */}
                        <FileUpload
                          files={videos}
                          onFilesChange={setVideos}
                          selectedFiles={selectedVideos}
                          onSelectionChange={(files) => {
                            setSelectedVideos(files)
                            setConfig((prev) => ({
                              ...prev,
                              srInputVideo: files[0]
                            }))
                          }}
                          accept="video/*"
                          maxCount={5}
                          title="上传视频（仅超分模式）"
                          description="支持 MP4 等视频格式，系统会对选定的视频进行 15 秒切分 + 超分 + 合并"
                          showCheckbox={true}
                        />
                      </>
                    )}
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

                <Tabs.TabPane tab={<Space><VideoCameraOutlined />现有视频</Space>} key="existing-videos">
                  <FileManager
                    fileType="videos"
                    selectedFiles={selectedVideos}
                    onSelectionChange={(files) => {
                      setSelectedVideos(files)
                      setConfig((prev) => ({
                        ...prev,
                        srInputVideo: files[0]
                      }))
                    }}
                    onFilesChange={setExistingVideos}
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
                disabled={
                  isProcessing ||
                  (config.mode === 'generate_and_upscale' &&
                    (selectedImages.length === 0 || selectedAudios.length === 0)) ||
                  (config.mode === 'upscale_only' && selectedVideos.length === 0)
                }
                style={{ width: '100%', height: 48 }}
              >
                {isProcessing
                  ? '处理中...'
                  : config.mode === 'generate_and_upscale'
                  ? '开始生成视频并超分'
                  : '开始仅超分视频'}
              </Button>

              {/* 状态提示 */}
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                {config.mode === 'generate_and_upscale' ? (
                  <Text type="secondary">
                    {selectedImages.length} 张图片 + {selectedAudios.length} 个音频文件
                  </Text>
                ) : (
                  <Text type="secondary">{selectedVideos.length} 个待超分视频</Text>
                )}
              </div>
            </Card>
          </Col>

          {/* 右侧：任务详情 */}
          <Col xs={24} lg={14}>
            <TaskDetails
              tasks={allTasks}
              onRefresh={loadAllTasks}
              loading={isLoadingTasks}
            />
          </Col>
        </Row>
      </Content>

    </Layout>
  )
}

export default App