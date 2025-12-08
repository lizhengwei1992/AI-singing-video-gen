import React from 'react'
import { Form, Input, Slider, InputNumber, Card, Space, Radio, Alert } from 'antd'
import { TaskConfig as TaskConfigType } from '../types'

interface TaskConfigProps {
  config: TaskConfigType
  onConfigChange: (config: TaskConfigType) => void
}

const TaskConfig: React.FC<TaskConfigProps> = ({ config, onConfigChange }) => {
  const handleFormChange = (changedValues: any, allValues: any) => {
    let nextConfig: TaskConfigType = {
      ...config,
      ...changedValues
    }

    // 切换模式时，调整默认分割时长
    if (changedValues.mode) {
      if (changedValues.mode === 'upscale_only') {
        nextConfig.segmentDuration = 15
      } else if (changedValues.mode === 'generate_and_upscale' && config.segmentDuration === 15) {
        // 回到生成模式时，如果之前是默认15，则恢复为30
        nextConfig.segmentDuration = 30
      }
    }

    onConfigChange(nextConfig)
  }

  return (
    <Card title="任务配置" style={{ marginBottom: 24 }}>
      <Form
        layout="vertical"
        initialValues={config}
        onValuesChange={handleFormChange}
      >
        <Form.Item
          label="任务模式"
          name="mode"
          tooltip="选择是先生成视频再进行超分，还是只对已有视频做超分"
        >
          <Radio.Group>
            <Radio.Button value="generate_and_upscale">生成 + 超分（默认）</Radio.Button>
            <Radio.Button value="upscale_only">仅超分（使用已有视频）</Radio.Button>
          </Radio.Group>
        </Form.Item>

        {/* 生成 + 超分模式：同时显示音频和视频分割时长 */}
        {config.mode === 'generate_and_upscale' && (
          <>
            <Form.Item
              label="音频分割时长（秒）"
              name="audioSegmentDuration"
              tooltip="将长音频分割为指定时长的片段"
            >
              <Space>
                <Slider
                  min={5}
                  max={120}
                  step={5}
                  value={config.audioSegmentDuration}
                  onChange={(value) =>
                    onConfigChange({
                      ...config,
                      audioSegmentDuration: value as number
                    })
                  }
                  style={{ width: 200 }}
                />
                <InputNumber
                  min={5}
                  max={120}
                  value={config.audioSegmentDuration}
                  onChange={(value) =>
                    onConfigChange({
                      ...config,
                      audioSegmentDuration: (value as number) || 30
                    })
                  }
                />
              </Space>
            </Form.Item>

            <Form.Item
              label="视频分割时长（秒）"
              name="videoSegmentDuration"
              tooltip="对合并后的视频进行超分前的切片时长"
            >
              <Space>
                <Slider
                  min={5}
                  max={60}
                  step={5}
                  value={config.videoSegmentDuration}
                  onChange={(value) =>
                    onConfigChange({
                      ...config,
                      videoSegmentDuration: value as number
                    })
                  }
                  style={{ width: 200 }}
                />
                <InputNumber
                  min={5}
                  max={60}
                  value={config.videoSegmentDuration}
                  onChange={(value) =>
                    onConfigChange({
                      ...config,
                      videoSegmentDuration: (value as number) || 10
                    })
                  }
                />
              </Space>
            </Form.Item>
          </>
        )}

        {/* 仅超分模式：只需要视频分割时长 */}
        {config.mode === 'upscale_only' && (
          <Form.Item
            label="视频分割时长（秒）"
            name="videoSegmentDuration"
            tooltip="将输入视频按指定时长切成片段再逐段超分"
          >
            <Space>
              <Slider
                min={5}
                max={60}
                step={5}
                value={config.videoSegmentDuration}
                onChange={(value) =>
                  onConfigChange({
                    ...config,
                    videoSegmentDuration: value as number
                  })
                }
                style={{ width: 200 }}
              />
              <InputNumber
                min={5}
                max={60}
                value={config.videoSegmentDuration}
                onChange={(value) =>
                  onConfigChange({
                    ...config,
                    videoSegmentDuration: (value as number) || 10
                  })
                }
              />
            </Space>
          </Form.Item>
        )}

        <Form.Item
          label="输出文件名前缀"
          name="outputPrefix"
          tooltip="生成视频文件的前缀名称"
        >
          <Input placeholder="例如：my_video" />
        </Form.Item>

        {config.mode !== 'upscale_only' && (
          <Form.Item
            label="Prompt 文本"
            name="prompt"
            tooltip="描述视频内容的文本提示"
          >
            <Input.TextArea
              rows={4}
              placeholder="例如：A person is singing | A person sings freely, changing body movements and expressions with the rhythm of the music | A person is singing"
            />
          </Form.Item>
        )}

        {config.mode === 'upscale_only' && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 8 }}
            message="当前为仅超分模式，请在左侧选择一个视频作为输入（现有视频或上传视频），系统会对该视频进行 15 秒切分 + 超分 + 合并。"
            description={
              config.srInputVideo
                ? `已选择视频：${config.srInputVideo.split('/').pop()}`
                : '尚未选择输入视频'
            }
          />
        )}
      </Form>
    </Card>
  )
}

export default TaskConfig