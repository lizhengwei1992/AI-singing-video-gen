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
import VideoGenConfig from './components/VideoGenConfig'
import ImageGenConfig from './components/ImageGenConfig'
import { UploadFile, TaskConfig as TaskConfigType, TaskStatus, VideoGenConfig as VideoGenConfigType, ImageGenConfig as ImageGenConfigType } from './types'

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
  const [mainTab, setMainTab] = useState('singing-video-gen')
  
  // Video-gen相关状态
  const [videoGenConfig, setVideoGenConfig] = useState<VideoGenConfigType>({
    mode: 'single_image',
    outputName: 'my_video',
    positivePrompt: '一边唱歌一边跳舞,双手比心，挑逗观众',
    negativePrompt: '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走',
    videoLength: 81,
    needUpscale: false
  })
  const [videoGenImages, setVideoGenImages] = useState<UploadFile[]>([])
  const [selectedVideoGenImage, setSelectedVideoGenImage] = useState<string | undefined>()
  const [selectedFirstFrameImage, setSelectedFirstFrameImage] = useState<string | undefined>()
  const [selectedLastFrameImage, setSelectedLastFrameImage] = useState<string | undefined>()
  const [isProcessingVideoGen, setIsProcessingVideoGen] = useState(false)
  
  // Image-gen相关状态
  const [imageGenConfig, setImageGenConfig] = useState<ImageGenConfigType>({
    mode: 'image_to_prompt',
    imageToPrompt: {
      prompt: '你是一位拥有 10 年以上经验的电影分镜脚本设计师，专精于类型片视觉叙事，熟悉好莱坞与独立电影的分镜语法体系。\n\n基于提供的扩展叙事，生成电影分镜提示文本，每组文本需包含镜头景别、镜头运动、画面主体、动作细节、光影风格、声音设计六大核心要素，格式如下：\n\nNext Scene: [镜头序号]，[景别]，[镜头运动]，画面中[主体]在[环境]下做[动作]，[光影风格]营造[情绪氛围]，[声音元素]强化叙事节奏，文字长度控制在180-220字，无特殊符号，语言风格匹配类型片创作语境。\n\n扩展叙事如下：\n\n'
    },
    imageToStoryboard: {
      prompt: '中景，面前摆着专业麦克风，缓慢推近，画面中老者立于暗黑背景前，身着橙黑相间道袍，长须垂胸，头戴冠冕，目光沉静如渊，面部皱纹如刻，光影从侧方打来，明暗对比强烈，烘托出威严与孤寂，低沉古琴声与风铃轻响交织，节奏缓慢而庄重，暗示其掌控命运之重。\n',
      outputFilename: 'storyboard_001'
    }
  })
  const [imageGenImages, setImageGenImages] = useState<UploadFile[]>([])
  const [selectedImageGenImage, setSelectedImageGenImage] = useState<string | undefined>()
  const [isProcessingImageGen, setIsProcessingImageGen] = useState(false)

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
      // 生成日期时间格式的任务名称
      const now = new Date()
      const dateTimeStr = now.toISOString().replace(/[:.]/g, '-').slice(0, -5) // 格式: 2024-01-01T12-30-45
      const taskName = `${dateTimeStr}_${config.outputPrefix || 'task'}`
      
      const payload =
        mode === 'generate_and_upscale'
          ? {
              images: selectedImages,
              audios: selectedAudios,
              config: {
                ...config,
                outputPrefix: taskName,
                // 兼容后端旧字段，顺带填充 segmentDuration
                segmentDuration: config.audioSegmentDuration
              }
            }
          : {
              images: [],
              audios: [],
              config: {
                ...config,
                outputPrefix: taskName,
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

  const handleStartVideoGen = useCallback(async () => {
    if (videoGenConfig.mode === 'single_image') {
      if (!selectedVideoGenImage) {
        message.error('请选择一张图片')
        return
      }
    } else if (videoGenConfig.mode === 'first_last_frame') {
      if (!selectedFirstFrameImage || !selectedLastFrameImage) {
        message.error('请选择首帧和尾帧图片')
        return
      }
    }

    setIsProcessingVideoGen(true)
    try {
      // 生成日期时间格式的任务名称
      const now = new Date()
      const dateTimeStr = now.toISOString().replace(/[:.]/g, '-').slice(0, -5) // 格式: 2024-01-01T12-30-45
      const taskName = `${dateTimeStr}_${videoGenConfig.outputName || 'video'}`
      
      const payload = {
        mode: videoGenConfig.mode,
        outputName: taskName,
        positivePrompt: videoGenConfig.positivePrompt,
        negativePrompt: videoGenConfig.negativePrompt,
        videoLength: videoGenConfig.videoLength,
        needUpscale: videoGenConfig.needUpscale,
        singleImage: videoGenConfig.mode === 'single_image' ? selectedVideoGenImage : undefined,
        firstFrameImage: videoGenConfig.mode === 'first_last_frame' ? selectedFirstFrameImage : undefined,
        lastFrameImage: videoGenConfig.mode === 'first_last_frame' ? selectedLastFrameImage : undefined
      }

      const response = await fetch('/api/video-gen/submit', {
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
      message.success('任务已提交，可在右侧任务列表中点击"刷新"查看最新进度')
      await loadAllTasks()
    } catch (error) {
      message.error(`提交任务失败: ${error}`)
    } finally {
      setIsProcessingVideoGen(false)
    }
  }, [videoGenConfig, selectedVideoGenImage, selectedFirstFrameImage, selectedLastFrameImage, loadAllTasks])

  const handleStartImageGen = useCallback(async () => {
    if (imageGenConfig.mode === 'image_to_prompt') {
      if (!selectedImageGenImage) {
        message.error('请选择一张图片')
        return
      }
      if (!imageGenConfig.imageToPrompt?.prompt) {
        message.error('请输入提示词')
        return
      }
    } else {
      if (!selectedImageGenImage) {
        message.error('请选择一张图片')
        return
      }
      if (!imageGenConfig.imageToStoryboard?.prompt) {
        message.error('请输入提示词')
        return
      }
      if (!imageGenConfig.imageToStoryboard?.outputFilename) {
        message.error('请输入输出文件名')
        return
      }
    }

    setIsProcessingImageGen(true)
    try {
      if (imageGenConfig.mode === 'image_to_prompt') {
        // 图生提示词
        const response = await fetch('/api/image-gen/image-to-prompt', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            image: selectedImageGenImage,
            prompt: imageGenConfig.imageToPrompt?.prompt || ''
          })
        })

        if (!response.ok) {
          throw new Error('提交任务失败')
        }

        const result = await response.json()
        setImageGenConfig({
          ...imageGenConfig,
          imageToPrompt: {
            ...imageGenConfig.imageToPrompt,
            prompt: imageGenConfig.imageToPrompt?.prompt || '',
            generatedPrompt: result.generated_prompt
          }
        })
        message.success('提示词生成成功')
      } else {
        // 单图生成分镜
        const response = await fetch('/api/image-gen/image-to-storyboard', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            image: selectedImageGenImage,
            prompt: imageGenConfig.imageToStoryboard!.prompt,
            outputFilename: imageGenConfig.imageToStoryboard!.outputFilename
          })
        })

        if (!response.ok) {
          throw new Error('提交任务失败')
        }

        const result = await response.json()
        setImageGenConfig({
          ...imageGenConfig,
          imageToStoryboard: {
            ...imageGenConfig.imageToStoryboard,
            prompt: imageGenConfig.imageToStoryboard?.prompt || '',
            outputFilename: imageGenConfig.imageToStoryboard?.outputFilename || '',
            outputFiles: result.output_files
          }
        })
        message.success('分镜生成成功')
      }
    } catch (error) {
      message.error(`提交任务失败: ${error}`)
    } finally {
      setIsProcessingImageGen(false)
    }
  }, [imageGenConfig, selectedImageGenImage])

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
            🎬 AI视频生成工具
          </Title>
        </div>
      </Header>

      <Content style={{ padding: '24px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        <Tabs
          activeKey={mainTab}
          onChange={setMainTab}
          size="large"
          style={{ marginBottom: 24 }}
        >
          <Tabs.TabPane tab="AI-singing-video-gen" key="singing-video-gen">
        <Row gutter={[24, 24]}>
          {/* 左侧：文件上传和配置 */}
          <Col xs={24} lg={12}>
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
            </Card>
          </Col>

          {/* 右侧：任务配置 */}
          <Col xs={24} lg={12}>
            <Card
              title={
                <Space>
                  <SettingOutlined />
                  任务配置
                </Space>
              }
              style={{ height: 'fit-content' }}
            >
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
        </Row>
          </Tabs.TabPane>

          <Tabs.TabPane tab="video-gen" key="video-gen">
            <Row gutter={[24, 24]}>
              {/* 左侧：文件上传和配置 */}
              <Col xs={24} lg={12}>
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
                        {videoGenConfig.mode === 'single_image' && (
                          <>
                            {/* 单图上传 */}
                            <FileUpload
                              files={videoGenImages}
                              onFilesChange={setVideoGenImages}
                              selectedFiles={selectedVideoGenImage ? [selectedVideoGenImage] : []}
                              onSelectionChange={(files) => setSelectedVideoGenImage(files[0])}
                              accept="image/*"
                              maxCount={1}
                              title="上传图片（单图生视频）"
                              description="支持 PNG、JPG 格式，单张图片"
                              showCheckbox={false}
                            />
                          </>
                        )}

                        {videoGenConfig.mode === 'first_last_frame' && (
                          <>
                            {/* 首帧图片上传 */}
                            <FileUpload
                              files={videoGenImages.filter(f => f.url === selectedFirstFrameImage)}
                              onFilesChange={(newFiles) => {
                                const allFiles = videoGenImages.filter(f => f.url !== selectedFirstFrameImage && f.url !== selectedLastFrameImage)
                                setVideoGenImages([...allFiles, ...newFiles])
                              }}
                              selectedFiles={selectedFirstFrameImage ? [selectedFirstFrameImage] : []}
                              onSelectionChange={(files) => setSelectedFirstFrameImage(files[0])}
                              accept="image/*"
                              maxCount={1}
                              title="上传首帧图片"
                              description="支持 PNG、JPG 格式，首帧图片"
                              showCheckbox={false}
                            />

                            <Divider />

                            {/* 尾帧图片上传 */}
                            <FileUpload
                              files={videoGenImages.filter(f => f.url === selectedLastFrameImage)}
                              onFilesChange={(newFiles) => {
                                const allFiles = videoGenImages.filter(f => f.url !== selectedFirstFrameImage && f.url !== selectedLastFrameImage)
                                setVideoGenImages([...allFiles, ...newFiles])
                              }}
                              selectedFiles={selectedLastFrameImage ? [selectedLastFrameImage] : []}
                              onSelectionChange={(files) => setSelectedLastFrameImage(files[0])}
                              accept="image/*"
                              maxCount={1}
                              title="上传尾帧图片"
                              description="支持 PNG、JPG 格式，尾帧图片"
                              showCheckbox={false}
                            />
                          </>
                        )}
                      </Space>
                    </Tabs.TabPane>

                    <Tabs.TabPane tab={<Space><FileImageOutlined />现有图片</Space>} key="existing-images">
                      <FileManager
                        fileType="images"
                        selectedFiles={
                          videoGenConfig.mode === 'single_image'
                            ? selectedVideoGenImage ? [selectedVideoGenImage] : []
                            : [
                                ...(selectedFirstFrameImage ? [selectedFirstFrameImage] : []),
                                ...(selectedLastFrameImage ? [selectedLastFrameImage] : [])
                              ]
                        }
                        onSelectionChange={(files) => {
                          if (videoGenConfig.mode === 'single_image') {
                            setSelectedVideoGenImage(files[0])
                          } else {
                            if (files.length >= 2) {
                              setSelectedFirstFrameImage(files[0])
                              setSelectedLastFrameImage(files[1])
                            } else if (files.length === 1) {
                              if (!selectedFirstFrameImage) {
                                setSelectedFirstFrameImage(files[0])
                              } else if (!selectedLastFrameImage) {
                                setSelectedLastFrameImage(files[0])
                              }
                            }
                          }
                        }}
                        onFilesChange={setExistingImages}
                      />
                    </Tabs.TabPane>
                  </Tabs>
                </Card>
              </Col>

              {/* 右侧：视频生成配置 */}
              <Col xs={24} lg={12}>
                <Card
                  title={
                    <Space>
                      <SettingOutlined />
                      视频生成配置
                    </Space>
                  }
                  style={{ height: 'fit-content' }}
                >
                  <VideoGenConfig config={videoGenConfig} onConfigChange={setVideoGenConfig} />

                  <Divider />

                  {/* 开始处理按钮 */}
                  <Button
                    type="primary"
                    size="large"
                    icon={<PlayCircleOutlined />}
                    onClick={handleStartVideoGen}
                    loading={isProcessingVideoGen}
                    disabled={
                      isProcessingVideoGen ||
                      (videoGenConfig.mode === 'single_image' && !selectedVideoGenImage) ||
                      (videoGenConfig.mode === 'first_last_frame' && (!selectedFirstFrameImage || !selectedLastFrameImage))
                    }
                    style={{ width: '100%', height: 48 }}
                  >
                    {isProcessingVideoGen
                      ? '处理中...'
                      : videoGenConfig.needUpscale
                      ? '开始生成视频并超分'
                      : '开始生成视频'}
                  </Button>

                  {/* 状态提示 */}
                  <div style={{ textAlign: 'center', marginTop: 16 }}>
                    {videoGenConfig.mode === 'single_image' ? (
                      <Text type="secondary">
                        {selectedVideoGenImage ? '已选择1张图片' : '未选择图片'}
                      </Text>
                    ) : (
                      <Text type="secondary">
                        {selectedFirstFrameImage && selectedLastFrameImage
                          ? '已选择首尾帧图片'
                          : '未选择完整首尾帧图片'}
                      </Text>
                    )}
                  </div>
                </Card>
              </Col>
            </Row>
          </Tabs.TabPane>

          <Tabs.TabPane tab="image_gen" key="image-gen">
            <Row gutter={[24, 24]}>
              {/* 左侧：文件上传和配置 */}
              <Col xs={24} lg={12}>
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
                          files={imageGenImages}
                          onFilesChange={setImageGenImages}
                          selectedFiles={selectedImageGenImage ? [selectedImageGenImage] : []}
                          onSelectionChange={(files) => setSelectedImageGenImage(files[0])}
                          accept="image/*"
                          maxCount={1}
                          title="上传图片"
                          description="支持 PNG、JPG 格式，单张图片"
                          showCheckbox={false}
                        />
                      </Space>
                    </Tabs.TabPane>

                    <Tabs.TabPane tab={<Space><FileImageOutlined />现有图片</Space>} key="existing-images">
                      <FileManager
                        fileType="images"
                        selectedFiles={selectedImageGenImage ? [selectedImageGenImage] : []}
                        onSelectionChange={(files) => setSelectedImageGenImage(files[0])}
                        onFilesChange={setExistingImages}
                      />
                    </Tabs.TabPane>
                  </Tabs>
                </Card>
              </Col>

              {/* 右侧：图片生成配置 */}
              <Col xs={24} lg={12}>
                <Card
                  title={
                    <Space>
                      <SettingOutlined />
                      图片生成配置
                    </Space>
                  }
                  style={{ height: 'fit-content' }}
                >
                  <ImageGenConfig config={imageGenConfig} onConfigChange={setImageGenConfig} />

                  <Divider />

                  {/* 开始处理按钮 */}
                  <Button
                    type="primary"
                    size="large"
                    icon={<PlayCircleOutlined />}
                    onClick={handleStartImageGen}
                    loading={isProcessingImageGen}
                    disabled={
                      isProcessingImageGen ||
                      !selectedImageGenImage ||
                      (imageGenConfig.mode === 'image_to_prompt' && !imageGenConfig.imageToPrompt?.prompt) ||
                      (imageGenConfig.mode === 'image_to_storyboard' && (!imageGenConfig.imageToStoryboard?.prompt || !imageGenConfig.imageToStoryboard?.outputFilename))
                    }
                    style={{ width: '100%', height: 48 }}
                  >
                    {isProcessingImageGen
                      ? '处理中...'
                      : imageGenConfig.mode === 'image_to_prompt'
                      ? '开始生成提示词'
                      : '开始生成分镜'}
                  </Button>

                  {/* 状态提示 */}
                  <div style={{ textAlign: 'center', marginTop: 16 }}>
                    <Text type="secondary">
                      {selectedImageGenImage ? '已选择1张图片' : '未选择图片'}
                    </Text>
                  </div>

                  {/* 显示生成的分镜图片 */}
                  {imageGenConfig.mode === 'image_to_storyboard' && imageGenConfig.imageToStoryboard?.outputFiles && imageGenConfig.imageToStoryboard.outputFiles.length > 0 && (
                    <div style={{ marginTop: 24 }}>
                      <Divider>生成结果</Divider>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {imageGenConfig.imageToStoryboard.outputFiles.map((filename, index) => (
                          <div key={index}>
                            <img
                              src={`/api/image-gen/output/${encodeURIComponent(filename)}`}
                              alt={`生成的分镜 ${index + 1}`}
                              style={{ maxWidth: '100%', height: 'auto', border: '1px solid #d9d9d9', borderRadius: 4 }}
                            />
                          </div>
                        ))}
                      </Space>
                    </div>
                  )}
                </Card>
              </Col>
            </Row>
          </Tabs.TabPane>

          <Tabs.TabPane tab="任务详情" key="task-details">
            <TaskDetails
              tasks={allTasks}
              onRefresh={loadAllTasks}
              loading={isLoadingTasks}
            />
          </Tabs.TabPane>
        </Tabs>
      </Content>

    </Layout>
  )
}

export default App