import React from 'react';

const ActivityFeed = ({ activities = [] }) => {
  // Default activities if none provided
  const defaultActivities = [
    {
      id: 1,
      icon: '🆕',
      content: 'New user registration: John Smith (Funder)',
      time: '2 hours ago'
    },
    {
      id: 2,
      icon: '📁',
      content: 'New project listed: Sydney CBD Development',
      time: '4 hours ago'
    },
    {
      id: 3,
      icon: '✓',
      content: 'Project published: Melbourne Apartments',
      time: 'Yesterday'
    }
  ];

  const displayActivities = activities.length > 0 ? activities : defaultActivities;

  return (
    <div className="activity-feed">
      <h3>Recent Activity</h3>
      <div className="activity-list">
        {displayActivities.map(activity => (
          <div key={activity.id} className="activity-item">
            <span className="activity-icon">{activity.icon}</span>
            <div className="activity-content">
              <p>{activity.content}</p>
              <span className="activity-time">{activity.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActivityFeed;