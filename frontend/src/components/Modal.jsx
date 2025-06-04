import React, { useEffect, useState, useRef } from 'react';

export const Modal = ({ isOpen, onClose, title, children, size = 'medium' }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content modal-${size}`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
};

export const ConfirmationDialog = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) => {
  const [inputValue, setInputValue] = useState('');
  const requiresInput = message.includes('type "DELETE"');

  const handleConfirm = () => {
    if (requiresInput && inputValue !== 'DELETE') {
      return;
    }
    onConfirm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="small">
      <div className="confirmation-dialog">
        <p>{message}</p>
        {requiresInput && (
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type DELETE to confirm"
            className="form-input"
          />
        )}
        <div className="dialog-actions">
          <button onClick={onClose} className="btn btn-outline">
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={requiresInput && inputValue !== 'DELETE'}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
};

