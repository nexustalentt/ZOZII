import { useState, useRef, type FormEvent, type ChangeEvent } from 'react'
import type { AppRelease } from '../lib/types'
import {
  uploadReleaseFile,
  setActiveRelease,
  resetToBundledRelease,
} from '../lib/api'

interface ReleaseManagerPanelProps {
  currentRelease: AppRelease
  onReleaseChanged: (release: AppRelease) => void
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return 'Unknown size'
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

export default function ReleaseManagerPanel({
  currentRelease,
  onReleaseChanged,
}: ReleaseManagerPanelProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'upload' | 'external'>('upload')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [version, setVersion] = useState(currentRelease.version || '0.1.0')
  const [notes, setNotes] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // External URL form state
  const [extUrl, setExtUrl] = useState('')
  const [extFilename, setExtFilename] = useState('DTDC Service Setup.exe')
  const [extVersion, setExtVersion] = useState('0.1.0')
  const [isSavingExt, setIsSavingExt] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null)
    setSuccess(null)
    const files = e.target.files
    if (files && files.length > 0) {
      const file = files[0]
      if (!file.name.toLowerCase().endsWith('.exe')) {
        setError('Please select a valid Windows executable (.exe) file.')
        setSelectedFile(null)
        return
      }
      setSelectedFile(file)
    }
  }

  const handleUploadSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedFile) {
      setError('Please select an .exe file to upload.')
      return
    }

    setIsUploading(true)
    setError(null)
    setSuccess(null)
    setUploadStatus('Uploading EXE to Supabase Storage… please wait.')

    try {
      const res = await uploadReleaseFile(selectedFile, version, notes)
      if (!res.ok || !res.release) {
        setError(res.error || 'Upload failed. Please check Supabase storage settings.')
      } else {
        setSuccess(`Successfully uploaded and activated ${res.release.filename}!`)
        onReleaseChanged(res.release)
        setSelectedFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setIsUploading(false)
      setUploadStatus(null)
    }
  }

  const handleExternalSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!extUrl.trim()) {
      setError('Please enter a valid download URL.')
      return
    }

    setIsSavingExt(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await setActiveRelease({
        download_url: extUrl.trim(),
        filename: extFilename.trim() || 'DTDC Service Setup.exe',
        version: extVersion.trim() || '0.1.0',
      })

      if (!res.ok || !res.release) {
        setError(res.error || 'Failed to save download URL.')
      } else {
        setSuccess('Successfully updated download URL!')
        onReleaseChanged(res.release)
        setExtUrl('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update download URL.')
    } finally {
      setIsSavingExt(false)
    }
  }

  const handleResetToDefault = () => {
    if (
      window.confirm(
        'Reset download link to the default bundled installer (/DTDC Service Setup.exe)?',
      )
    ) {
      const def = resetToBundledRelease()
      onReleaseChanged(def)
      setSuccess('Reset to default bundled installer.')
      setError(null)
    }
  }

  const copyDownloadLink = () => {
    const fullUrl = currentRelease.download_url.startsWith('http')
      ? currentRelease.download_url
      : `${window.location.origin}${currentRelease.download_url}`
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="card release-card">
      <div className="release-header">
        <div className="release-title-wrap">
          <span className="release-badge-icon">📦</span>
          <div>
            <h2 className="release-title">Desktop App Installer (EXE)</h2>
            <p className="release-sub">
              Manage the downloadable Windows executable served on your home page
            </p>
          </div>
        </div>

        <div className="release-header-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={copyDownloadLink}
            title="Copy public download link"
          >
            {copied ? '✓ Link copied!' : '🔗 Copy download link'}
          </button>
          <a
            href={currentRelease.download_url}
            download={currentRelease.filename}
            className="btn btn-secondary btn-sm"
          >
            ⬇ Test download
          </a>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-danger-text"
            onClick={handleResetToDefault}
            title="Revert to bundled installer"
          >
            Reset to default
          </button>
        </div>
      </div>

      {/* Current Active Release Info Banner */}
      <div className="release-status-box">
        <div className="release-status-grid">
          <div>
            <span className="release-label">Active file</span>
            <div className="release-value release-filename">{currentRelease.filename}</div>
          </div>
          <div>
            <span className="release-label">Version</span>
            <div className="release-value">v{currentRelease.version || '0.1.0'}</div>
          </div>
          <div>
            <span className="release-label">File size</span>
            <div className="release-value">{formatBytes(currentRelease.file_size_bytes)}</div>
          </div>
          <div>
            <span className="release-label">Source</span>
            <div className="release-value release-source">
              {currentRelease.download_url.startsWith('http')
                ? 'Cloud / Uploaded Storage'
                : 'Bundled Site Asset'}
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && <div className="release-alert release-alert-error">{error}</div>}
      {success && <div className="release-alert release-alert-success">{success}</div>}
      {uploadStatus && <div className="release-alert release-alert-info">{uploadStatus}</div>}

      {/* Tab Switcher */}
      <div className="release-tabs">
        <button
          type="button"
          className={`release-tab ${activeTab === 'upload' ? 'release-tab--active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          ⬆ Upload new EXE
        </button>
        <button
          type="button"
          className={`release-tab ${activeTab === 'external' ? 'release-tab--active' : ''}`}
          onClick={() => setActiveTab('external')}
        >
          🌐 External download URL
        </button>
      </div>

      {/* Upload Form */}
      {activeTab === 'upload' && (
        <form className="release-form" onSubmit={handleUploadSubmit}>
          <div className="release-dropzone">
            <input
              ref={fileInputRef}
              type="file"
              accept=".exe,application/vnd.microsoft.portable-executable,application/x-msdownload"
              id="exe-file-input"
              className="release-file-input"
              onChange={handleFileSelect}
              disabled={isUploading}
            />
            <label htmlFor="exe-file-input" className="release-dropzone-label">
              <span className="release-dropzone-icon">📁</span>
              {selectedFile ? (
                <div className="release-selected-file">
                  <strong>{selectedFile.name}</strong>
                  <span>({formatBytes(selectedFile.size)})</span>
                </div>
              ) : (
                <div>
                  <strong>Click to select or drag &amp; drop an installer EXE</strong>
                  <p>Accepts .exe files (e.g. DTDC Service Setup.exe)</p>
                </div>
              )}
            </label>
          </div>

          <div className="release-fields-row">
            <div className="release-field">
              <label htmlFor="release-version" className="release-label">
                Version tag
              </label>
              <input
                id="release-version"
                type="text"
                className="release-input"
                placeholder="e.g. 0.1.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                disabled={isUploading}
              />
            </div>
            <div className="release-field release-field-wide">
              <label htmlFor="release-notes" className="release-label">
                Release notes (optional)
              </label>
              <input
                id="release-notes"
                type="text"
                className="release-input"
                placeholder="e.g. Performance improvements, updated speech recognition"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isUploading}
              />
            </div>
          </div>

          <div className="release-submit-row">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? 'Uploading file…' : 'Upload and activate EXE'}
            </button>
            <span className="release-note-hint">
              Uploaded files are stored in Supabase Storage and served to users immediately.
            </span>
          </div>
        </form>
      )}

      {/* External URL Form */}
      {activeTab === 'external' && (
        <form className="release-form" onSubmit={handleExternalSubmit}>
          <div className="release-field">
            <label htmlFor="ext-url" className="release-label">
              Direct Download URL
            </label>
            <input
              id="ext-url"
              type="url"
              className="release-input"
              placeholder="https://github.com/.../releases/download/v0.1.0/DTDC-Service-Setup.exe"
              value={extUrl}
              onChange={(e) => setExtUrl(e.target.value)}
              disabled={isSavingExt}
              required
            />
            <p className="release-help-text">
              Enter any direct download link (GitHub Releases, Google Drive, AWS S3, Cloudflare,
              etc.).
            </p>
          </div>

          <div className="release-fields-row">
            <div className="release-field">
              <label htmlFor="ext-filename" className="release-label">
                Display file name
              </label>
              <input
                id="ext-filename"
                type="text"
                className="release-input"
                placeholder="DTDC Service Setup.exe"
                value={extFilename}
                onChange={(e) => setExtFilename(e.target.value)}
                disabled={isSavingExt}
              />
            </div>
            <div className="release-field">
              <label htmlFor="ext-version" className="release-label">
                Version
              </label>
              <input
                id="ext-version"
                type="text"
                className="release-input"
                placeholder="0.1.0"
                value={extVersion}
                onChange={(e) => setExtVersion(e.target.value)}
                disabled={isSavingExt}
              />
            </div>
          </div>

          <div className="release-submit-row">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!extUrl.trim() || isSavingExt}
            >
              {isSavingExt ? 'Saving…' : 'Save active download URL'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
