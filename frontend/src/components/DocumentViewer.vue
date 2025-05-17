<template>
  <div class="document-viewer">
    <div class="document-header">
      <h3>{{ file.originalName }}</h3>
      <div class="viewer-info">
        <span class="view-count">{{ file.viewCount || 0 }} 명이 보는 중</span>
      </div>
    </div>

    <div class="document-content">
      <div v-if="loading" class="loading">
        문서를 불러오는 중...
      </div>
      <div v-else-if="error" class="error">
        {{ error }}
      </div>
      <div v-else class="preview-container">
        <!-- PDF 파일 미리보기 -->
        <iframe
          v-if="isPdfFile"
          :src="previewUrl"
          class="pdf-viewer"
          frameborder="0"
        ></iframe>

        <!-- Office 문서 미리보기 -->
        <div v-else-if="isOfficeFile" class="office-viewer-container">
          <div class="office-viewer-header">
            <h4>{{ file.originalName }}</h4>
            <p class="office-viewer-info">
              이 문서는 실시간으로 보기를 지원합니다. 다른 사용자들도 함께 보고 있습니다.
            </p>
          </div>
          <div class="office-viewer-content">
            <iframe
              :src="previewUrl"
              class="office-viewer"
              frameborder="0"
            ></iframe>
          </div>
        </div>

        <!-- 텍스트 파일 미리보기 -->
        <div v-else-if="isTextFile" class="text-viewer">
          <pre>{{ textContent }}</pre>
        </div>

        <!-- 지원하지 않는 파일 형식 -->
        <div v-else class="unsupported-format">
          이 파일 형식은 미리보기를 지원하지 않습니다.
          <div class="download-prompt">
            <button @click="downloadFile" class="download-button">
              다운로드하기
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios'

export default {
  name: 'DocumentViewer',

  props: {
    file: {
      type: Object,
      required: true
    },
    roomCode: {
      type: String,
      required: true
    },
    apiUrl: {
      type: String,
      required: true
    },
    socket: {
      type: Object,
      required: true
    },
    userId: {
      type: String,
      required: true
    }
  },

  data() {
    return {
      loading: true,
      error: null,
      previewUrl: '',
      textContent: '',
      previewInfo: null
    }
  },

  computed: {
    isPdfFile() {
      return this.file.mimetype === 'application/pdf' ||
             this.file.originalName.toLowerCase().endsWith('.pdf')
    },

    isOfficeFile() {
      const officeExtensions = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.hwp']
      const fileName = this.file.originalName.toLowerCase()
      return officeExtensions.some(ext => fileName.endsWith(ext))
    },

    isTextFile() {
      const textExtensions = ['.txt', '.csv', '.json', '.xml', '.html', '.css', '.js']
      const fileName = this.file.originalName.toLowerCase()
      return textExtensions.some(ext => fileName.endsWith(ext)) ||
             this.file.mimetype.startsWith('text/')
    },

    officeViewerUrl() {
      // Microsoft Office Online Viewer URL 생성
      const fileUrl = encodeURIComponent(`${this.apiUrl}/api/rooms/${this.roomCode}/files/${this.file.filename}`)
      return `https://view.officeapps.live.com/op/embed.aspx?src=${fileUrl}`
    }
  },

  async created() {
    try {
      // 문서 보기 시작 알림
      await this.notifyViewStart()

      // 파일 형식에 따라 다른 처리
      if (this.isPdfFile || this.isOfficeFile) {
        // 미리보기 정보 가져오기 (ID 사용)
        const response = await axios.get(
          `${this.apiUrl}/api/rooms/${this.roomCode}/files/download/${this.file.id}`
        )
        this.previewInfo = response.data

        if (this.isOfficeFile) {
          // Microsoft Office Online Viewer URL 생성
          const downloadUrl = encodeURIComponent(response.data.downloadUrl)
          this.previewUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${downloadUrl}`
        } else {
          // PDF는 직접 다운로드 URL 사용
          this.previewUrl = response.data.downloadUrl
        }
      } else if (this.isTextFile) {
        // 텍스트 파일 내용 가져오기 (ID 사용)
        const response = await axios.get(
          `${this.apiUrl}/api/rooms/${this.roomCode}/files/download/${this.file.id}`,
          { responseType: 'text' }
        )
        this.textContent = response.data
      }

      this.loading = false
    } catch (error) {
      console.error('문서 로드 오류:', error)
      this.error = '문서를 불러오는 중 오류가 발생했습니다.'
      this.loading = false
    }
  },

  beforeDestroy() {
    // 문서 보기 종료 알림
    this.notifyViewEnd()
  },

  methods: {
    async notifyViewStart() {
      try {
        await axios.post(
          `${this.apiUrl}/api/rooms/${this.roomCode}/files/${this.file.id}/view`,
          {
            userId: this.userId,
            action: 'join',
            openFile: false // 이미 열린 문서이므로 다른 사용자에게 전파하지 않음
          }
        )
      } catch (error) {
        console.error('보기 시작 알림 오류:', error)
      }
    },

    async notifyViewEnd() {
      try {
        await axios.post(
          `${this.apiUrl}/api/rooms/${this.roomCode}/files/${this.file.id}/view`,
          {
            userId: this.userId,
            action: 'leave'
          }
        )
      } catch (error) {
        console.error('보기 종료 알림 오류:', error)
      }
    },

    async downloadFile() {
      try {
        // 다운로드 URL 생성
        const downloadUrl = `${this.apiUrl}/api/rooms/${this.roomCode}/files/download/${this.file.id}?download=true`

        // axios를 사용하여 파일 다운로드
        const response = await axios({
          url: downloadUrl,
          method: 'GET',
          responseType: 'blob'
        })

        // Blob 생성
        const blob = new Blob([response.data], { type: this.file.mimetype })

        // 다운로드 링크 생성
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', this.file.originalName)
        document.body.appendChild(link)

        // 다운로드 시작
        link.click()

        // 링크 제거
        window.URL.revokeObjectURL(url)
        document.body.removeChild(link)
      } catch (error) {
        console.error('파일 다운로드 오류:', error)
      }
    }
  }
}
</script>

<style scoped>
.document-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  background-color: white;
}

.document-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background-color: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
}

.document-header h3 {
  margin: 0;
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viewer-info {
  font-size: 14px;
  color: #666;
}

.view-count {
  background-color: #e3f2fd;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 12px;
}

.document-content {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.loading, .error, .unsupported-format {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  padding: 20px;
  text-align: center;
  color: #666;
}

.error {
  color: #f44336;
}

.preview-container {
  height: 100%;
}

.pdf-viewer, .office-viewer-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #f9f9f9;
  border-radius: 4px;
  overflow: hidden;
}

.office-viewer-header {
  padding: 10px 15px;
  background-color: #e3f2fd;
  border-bottom: 1px solid #bbdefb;
}

.office-viewer-header h4 {
  margin: 0 0 5px 0;
  font-size: 16px;
  color: #1976d2;
}

.office-viewer-info {
  margin: 0;
  font-size: 12px;
  color: #546e7a;
}

.office-viewer-content {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.office-viewer {
  width: 100%;
  height: 100%;
  border: none;
}

.text-viewer {
  height: 100%;
  overflow: auto;
  padding: 15px;
  background-color: #f9f9f9;
}

.text-viewer pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: monospace;
}

.download-prompt {
  margin-top: 20px;
}

.download-button {
  padding: 8px 16px;
  background-color: #2196f3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.download-button:hover {
  background-color: #1976d2;
}
</style>
