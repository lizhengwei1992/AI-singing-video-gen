import React, { useCallback, useState } from 'react'
import { Upload, Button, message, List, Image, Space, Modal, Checkbox } from 'antd'
import { UploadOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons'
import type { UploadFile as AntdUploadFile, UploadProps } from 'antd'
import { UploadFile } from '../types'

interface FileUploadProps {
  files: UploadFile[]
  onFilesChange: (files: UploadFile[]) => void
  selectedFiles: string[]
  onSelectionChange: (selectedFiles: string[]) => void
  accept: string
  maxCount?: number
  title: string
  description: string
  showCheckbox?: boolean
}

const FileUpload: React.FC<FileUploadProps> = ({
  files,
  onFilesChange,
  selectedFiles,
  onSelectionChange,
  accept,
  maxCount = 10,
  title,
  description,
  showCheckbox = false
}) => {
  const [uploading, setUploading] = useState(false)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewImage, setPreviewImage] = useState('')
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set())

  // 生成文件唯一标识符 - 使用更可靠的标识方式
  const generateFileId = (file: File): string => {
    // 使用文件名、大小、最后修改时间和类型生成更唯一的ID
    return `${file.name}-${file.size}-${file.lastModified}-${file.type}`
  }

  const handleUpload = useCallback(async (file: File) => {
    const fileId = generateFileId(file)

    try {
      // 检查是否正在上传相同文件
      if (uploadingFiles.has(fileId)) {
        message.warning(`${file.name} 正在上传中，请稍候`)
        return false
      }

      // 检查是否已存在相同文件
      const existingFile = files.find(f => f.id === fileId)
      if (existingFile) {
        message.warning(`${file.name} 已存在，跳过上传`)
        return false
      }

      // 添加到正在上传集合
      setUploadingFiles(prev => new Set([...prev, fileId]))

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('上传失败')
      }

      const result = await response.json()

      // 如果是重复文件，显示提示信息
      if (result.duplicate) {
        message.warning(`${file.name} 已存在，跳过上传`)
        return false
      }

      // 上传成功，不再显示成功提示

      const newFile: UploadFile = {
        id: fileId,
        name: file.name,
        type: accept.includes('image')
          ? 'image'
          : accept.includes('audio')
          ? 'audio'
          : 'video',
        size: file.size,
        url: result.file_path,
        preview: accept.includes('image') ? URL.createObjectURL(file) : undefined
      }

      onFilesChange(prevFiles => [...prevFiles, newFile])
      // 不再显示上传成功提示
      return true
    } catch (error) {
      console.error('Upload error:', error)
      message.error(`${file.name} 上传失败: ${error}`)
      return false
    } finally {
      // 从正在上传集合中移除
      setUploadingFiles(prev => {
        const newSet = new Set(prev)
        newSet.delete(fileId)
        return newSet
      })
    }
  }, [onFilesChange, accept, files, uploadingFiles])

  const handleRemove = (fileId: string) => {
    const newFiles = files.filter(f => f.id !== fileId)
    onFilesChange(newFiles)
    // 不再显示删除成功提示
  }

  const handlePreview = (file: UploadFile) => {
    if (file.type === 'image' && file.preview) {
      setPreviewImage(file.preview)
      setPreviewVisible(true)
    } else if (file.type === 'audio' && file.url) {
      const audio = new Audio(file.url)
      audio.play()
    }
  }

  const uploadProps: UploadProps = {
    accept,
    multiple: true,
    showUploadList: false,
    beforeUpload: async (file, fileList) => {
      // 检查总文件数量
      const totalFiles = files.length + fileList.length
      if (totalFiles > maxCount) {
        message.error(`最多只能上传 ${maxCount} 个文件，当前已选择 ${fileList.length} 个文件`)
        return Upload.LIST_IGNORE  // 使用 LIST_IGNORE 而不是 false
      }

      setUploading(true)

      try {
        // 使用 Map 来去重，基于文件标识符
        const fileMap = new Map()
        fileList.forEach(f => {
          const fileId = generateFileId(f)
          fileMap.set(fileId, f)
        })

        // 过滤掉已存在的文件和正在上传的文件
        const newFiles = Array.from(fileMap.values()).filter(f => {
          const fileId = generateFileId(f)
          return !files.some(existing => existing.id === fileId) &&
                 !uploadingFiles.has(fileId)
        })

        if (newFiles.length === 0) {
          message.warning('所有文件都已存在或正在上传，无需重复上传')
          return Upload.LIST_IGNORE
        }

        console.log(`准备上传 ${newFiles.length} 个新文件`)

        // 使用 for...of 循环按顺序上传，避免并发问题
        const uploadResults = []
        for (const newFile of newFiles) {
          const result = await handleUpload(newFile)
          uploadResults.push(result)
        }

        const successCount = uploadResults.filter(r => r === true).length
        if (successCount > 0) {
          message.success(`成功上传 ${successCount} 个文件`)
        }
      } catch (error) {
        console.error('Batch upload error:', error)
        message.error('部分文件上传失败')
      } finally {
        setUploading(false)
      }

      return Upload.LIST_IGNORE
    },
    disabled: uploading
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 8 }}>{title}</h3>
        <p style={{ color: '#666', marginBottom: 16 }}>{description}</p>
        <Upload {...uploadProps}>
          <Button icon={<UploadOutlined />} loading={uploading}>
            选择文件
          </Button>
        </Upload>
      </div>

      {files.length > 0 && (
        <div>
          <div style={{ marginBottom: 8, fontSize: '14px', color: '#666' }}>
            已上传 {files.length} 个文件
            {uploadingFiles.size > 0 && ` (${uploadingFiles.size} 个正在上传...)`}
          </div>
          <div
            style={{
              maxHeight: '300px',
              overflowY: 'auto',
              border: '1px solid #f0f0f0',
              borderRadius: '8px',
              padding: '8px'
            }}
          >
            <List
              size="small"
              dataSource={files}
              renderItem={(file) => (
                <List.Item
                  actions={[
                    <Button
                      key="preview"
                      type="text"
                      icon={<EyeOutlined />}
                      onClick={() => handlePreview(file)}
                      size="small"
                      disabled={uploadingFiles.has(file.id)}
                    >
                      预览
                    </Button>,
                    <Button
                      key="delete"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemove(file.id)}
                      size="small"
                      disabled={uploadingFiles.has(file.id)}
                    >
                      删除
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      file.type === 'image' && file.preview ? (
                        <Image
                          width={50}
                          height={50}
                          src={file.preview}
                          style={{
                            objectFit: 'cover',
                            borderRadius: '6px'
                          }}
                          preview={false}
                        />
                      ) : (
                        <div
                          style={{
                            width: 50,
                            height: 50,
                            background: '#f0f0f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 6,
                            fontSize: '18px'
                          }}
                        >
                          🎵
                        </div>
                      )
                    }
                    title={
                      <div style={{ 
                        fontSize: '14px', 
                        fontWeight: 'normal',
                        color: uploadingFiles.has(file.id) ? '#999' : 'inherit'
                      }}>
                        {file.name}
                        {uploadingFiles.has(file.id) && ' (上传中...)'}
                      </div>
                    }
                    description={`${(file.size / 1024 / 1024).toFixed(2)} MB`}
                  />
                </List.Item>
              )}
            />
          </div>
        </div>
      )}

      {/* 图片预览模态框 */}
      <Modal
        open={previewVisible}
        footer={null}
        onCancel={() => setPreviewVisible(false)}
        width="80vw"
        style={{ maxWidth: '1200px' }}
      >
        <img
          alt="预览"
          style={{ width: '100%', height: 'auto', maxHeight: '80vh', objectFit: 'contain' }}
          src={previewImage}
        />
      </Modal>
    </div>
  )
}

export default FileUpload