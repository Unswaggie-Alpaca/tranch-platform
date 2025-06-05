import React, { useState, useEffect } from 'react';
import { useApp } from '../../hooks/useApp';
import { formatTime } from '../../utils/formatters';

const DealComments = ({ dealId, userRole }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const { user } = useApp();
  
  useEffect(() => {
    // Simulate comments data
    setComments([
      {
        id: 1,
        user_name: 'Developer',
        comment: 'Welcome to the deal room! Looking forward to working together.',
        created_at: new Date(Date.now() - 86400000).toISOString()
      },
      {
        id: 2,
        user_name: 'Funder',
        comment: 'Thank you! I\'ve reviewed the initial documents and have a few questions.',
        created_at: new Date(Date.now() - 43200000).toISOString()
      }
    ]);
  }, [dealId]);
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    
    const comment = {
      id: Date.now(),
      user_name: user.name,
      comment: newComment.trim(),
      created_at: new Date().toISOString()
    };
    
    setComments(prev => [...prev, comment]);
    setNewComment('');
  };
  
  return (
    <div className="deal-comments">
      <div className="comments-list">
        {comments.map(comment => (
          <div key={comment.id} className="comment-card">
            <div className="comment-avatar">
              {comment.user_name.charAt(0).toUpperCase()}
            </div>
            <div className="comment-content">
              <div className="comment-header">
                <span className="comment-author">{comment.user_name}</span>
                <span className="comment-time">{formatTime(comment.created_at)}</span>
              </div>
              <div className="comment-text">{comment.comment}</div>
            </div>
          </div>
        ))}
      </div>
      
      <form onSubmit={handleSubmit} className="comment-form">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          className="comment-input"
          rows="3"
        />
        <button type="submit" disabled={!newComment.trim()} className="btn btn-primary">
          Post Comment
        </button>
      </form>
    </div>
  );
};

export default DealComments;