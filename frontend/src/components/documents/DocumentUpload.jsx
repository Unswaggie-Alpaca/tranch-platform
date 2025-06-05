// components/documents/DocumentUpload.jsx

import React, { useState, useRef } from 'react';
import { useNotifications } from '../../contexts';

const DocumentUpload = ({ 
  onUpload, 
  documentType, 
  accept = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png',
  maxSize = 50 * 1024 * 1024, // 50MB default
  multiple = false,
  required = false,
  label,
  description,
  existingDocument = null
}) => {
  const { addNotification } = useNotifications();
  const fileInputRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const validateFile = (file) => {
    if (file.size > maxSize) {
      addNotification({
        type: 'error',
        title: 'File Too Large',
        message: `Maximum file size is ${maxSize / (1024 * 1024)}MB`
      });
      return false;
    }
    return true;
  };

  const handleFileSelect = (files) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(validateFile);
    
    if (validFiles.length > 0) {
      setSelectedFiles(validFiles);
      if (onUpload) {
        onUpload(validFiles, documentType);
      }
    }
  };

  const handleFileInput = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files);
    }
  };

  const removeFile = (index) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
  };

  const formatFileSize = (bytes) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="document-upload-item">
      <div className="document-header">
        <label htmlFor={`doc-${documentType}`}>
          {label || documentType?.replace(/_/g, ' ')} {required && '*'}
          {description && (
            <span className="help-icon" title={description}>?</span>
          )}
        </label>
        {(existingDocument || selectedFiles.length > 0) && (
          <span className="uploaded-badge">✓ {existingDocument ? 'Existing' : 'Ready to upload'}</span>
        )}
      </div>
      
      <div 
        className={`document-upload-zone ${isDragging ? 'dragging' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          id={`doc-${documentType}`}
          onChange={handleFileInput}
          accept={accept}
          multiple={multiple}
          style={{ display: 'none' }}
        />
        
        {selectedFiles.length === 0 && !existingDocument ? (
          <div className="upload-prompt">
            <svg className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p>Drag and drop files here or</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-outline upload-btn"
            >
              Choose Files
            </button>
            <p className="upload-info">
              Max file size: {maxSize / (1024 * 1024)}MB
            </p>
          </div>
        ) : (
          <div className="selected-files">
            {existingDocument && (
              <div className="file-item existing">
                <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <div className="file-info">
                  <span className="file-name">{existingDocument.file_name}</span>
                  <span className="file-status">Current file</span>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-sm btn-outline"
                >
                  Replace
                </button>
              </div>
            )}
            
            {selectedFiles.map((file, index) => (
              <div key={index} className="file-item">
                <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{formatFileSize(file.size)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="btn btn-sm btn-danger"
                >
                  Remove
                </button>
              </div>
            ))}
            
            {!existingDocument && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-outline add-more-btn"
              >
                Add More Files
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentUpload;