import React from 'react'
import { Form, Input, Slider, InputNumber, Card, Space } from 'antd'
import { TaskConfig as TaskConfigType } from '../types'

interface TaskConfigProps {
  config: TaskConfigType
  onConfigChange: (config: TaskConfigType) => void
}

const TaskConfig: React.FC<TaskConfigProps> = ({ config, onConfigChange }) => {
  const handleFormChange = (changedValues: any, allValues: any) => {
    onConfigChange({
      ...config,
      ...allValues
    })
  }

  return (
    <Card title="任务配置" style={{ marginBottom: 24 }}>
      <Form
        layout="vertical"
        initialValues={config}
        onValuesChange={handleFormChange}
      >
        <Form.Item
          label="音频分割时长（秒）"
          name="segmentDuration"
          tooltip="将长音频分割为指定时长的片段"
        >
          <Space>
            <Slider
              min={10}
              max={120}
              step={5}
              value={config.segmentDuration}
              onChange={(value) => onConfigChange({
                ...config,
                segmentDuration: value
              })}
              style={{ width: 200 }}
            />
            <InputNumber
              min={10}
              max={120}
              value={config.segmentDuration}
              onChange={(value) => onConfigChange({
                ...config,
                segmentDuration: value || 20
              })}
            />
          </Space>
        </Form.Item>

        <Form.Item
          label="输出文件名前缀"
          name="outputPrefix"
          tooltip="生成视频文件的前缀名称"
        >
          <Input placeholder="例如：my_video" />
        </Form.Item>

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
      </Form>
    </Card>
  )
}

export default TaskConfig