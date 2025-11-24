import React, { useState, useEffect } from 'react'
import { Card, List, Space, Button, Image, Typography, Checkbox, Row, Col, Empty, message } from 'antd'
import { DeleteOutlined, EyeOutlined, ReloadOutlined, SoundOutlined, PictureOutlined } from '@ant-design/icons'

const { Text } = Typography

interface FileItem {
  filename: string
  path: string
  size: number
  modified: number
}

interface FileManagerProps {
  fileType: 'images' | 'audios'
  selectedFiles: string[]
  onSelectionChange: (files: string[]) => void
  onFilesChange?: (files: FileItem[]) => void
}

const FileManager: React.FC<FileManagerProps> = ({
  fileType,
  selectedFiles,
  onSelectionChange,
  onFilesChange
}) => {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [previewImage, setPreviewImage] = useState<string>('')

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('zh-CN')
  }

  const loadFiles = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/files/${fileType}`)
      if (!response.ok) {
        throw new Error('获取文件列表失败')
      }
      const data = await response.json()
      const fileList = data[fileType] || []
      setFiles(fileList)
      if (onFilesChange) {
        onFilesChange(fileList)
      }
    } catch (error) {
      message.error(`加载文件失败: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const deleteFile = async (filename: string) => {
    try {
      const response = await fetch(`/api/files/${fileType}/${filename}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        throw new Error('删除文件失败')
      }
      message.success('文件删除成功')
      // 从选中列表中移除
      const newSelected = selectedFiles.filter(f => f !== filename)
      onSelectionChange(newSelected)
      // 重新加载文件列表
      loadFiles()
    } catch (error) {
      message.error(`删除文件失败: ${error}`)
    }
  }

  const handleCheckboxChange = (filePath: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedFiles, filePath])
    } else {
      onSelectionChange(selectedFiles.filter(f => f !== filePath))
    }
  }

  useEffect(() => {
    loadFiles()
    // 设置定时器定期刷新文件列表
    const interval = setInterval(() => {
      loadFiles()
    }, 5000) // 每5秒刷新一次

    return () => {
      clearInterval(interval)
    }
  }, [fileType])

  const isImage = fileType === 'images'

  return (
    <Card
      title={
        <Space>
          {isImage ? <PictureOutlined /> : <SoundOutlined />}
          {isImage ? '图片文件' : '音频文件'}
        </Space>
      }
      extra={
        <Button
          icon={<ReloadOutlined />}
          onClick={loadFiles}
          loading={loading}
          size="small"
        >
          刷新
        </Button>
      }
    >
      {files.length === 0 ? (
        <Empty
          description={`暂无${isImage ? '图片' : '音频'}文件`}
          style={{ padding: '40px 0' }}
        />
      ) : (
        <List
          dataSource={files}
          renderItem={(file) => (
            <List.Item
              actions={[
                isImage && (
                  <Button
                    icon={<EyeOutlined />}
                    size="small"
                    onClick={() => setPreviewImage(`/api/files/images/${file.filename}`)}
                  >
                    预览
                  </Button>
                ),
                <Button
                  icon={<DeleteOutlined />}
                  size="small"
                  danger
                  onClick={() => deleteFile(file.filename)}
                >
                  删除
                </Button>
              ].filter(Boolean)}
            >
              <List.Item.Meta
                avatar={
                  <Checkbox
                    checked={selectedFiles.includes(file.path)}
                    onChange={(e) => handleCheckboxChange(file.path, e.target.checked)}
                  />
                }
                title={
                  <Space>
                    <Text>{file.filename}</Text>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {formatFileSize(file.size)}
                    </Text>
                  </Space>
                }
                description={
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {formatDate(file.modified)}
                  </Text>
                }
              />
            </List.Item>
          )}
        />
      )}

      {/* 图片预览模态框 */}
      {isImage && (
        <Image
          preview={{
            visible: !!previewImage,
            onVisibleChange: (visible) => !visible && setPreviewImage(''),
            src: previewImage,
          }}
          src={previewImage}
          style={{ display: 'none' }}
        />
      )}
    </Card>
  )
}

export default FileManager