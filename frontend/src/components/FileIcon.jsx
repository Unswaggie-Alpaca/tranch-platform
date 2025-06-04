import React from 'react';

const fileTypeMap = {
  pdf: '📄',
  doc: '📄',
  docx: '📄',
  xls: '📊',
  xlsx: '📊',
  png: '🖼',
  jpg: '🖼',
  jpeg: '🖼',
  default: '📁'
};

const FileIcon = ({ type }) => {
  const key = (type || '').toLowerCase();
  const icon = fileTypeMap[key] || fileTypeMap.default;
  return <span className="file-icon" aria-hidden>{icon}</span>;
};

export { FileIcon };
