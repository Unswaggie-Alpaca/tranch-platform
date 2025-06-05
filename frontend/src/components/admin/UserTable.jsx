import React from 'react';
import { StatusBadge } from '../common/StatusBadge';
import { formatDate } from '../../utils/formatters';

const UserTable = ({ users, onViewUser, onApproveUser }) => {
  return (
    <div className="users-table">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Company</th>
            <th>Status</th>
            <th>Subscription</th>
            <th>Joined</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>
                <span className="role-badge">{user.role}</span>
              </td>
              <td>{user.company_name || '-'}</td>
              <td>
                <StatusBadge status={user.approved ? 'Approved' : 'Pending'} />
              </td>
              <td>
                {user.role === 'funder' && (
                  <StatusBadge status={user.subscription_status || 'inactive'} />
                )}
              </td>
              <td>{formatDate(user.created_at)}</td>
              <td className="actions-cell">
                <button
                  onClick={() => onViewUser(user)}
                  className="btn btn-sm btn-outline"
                >
                  View
                </button>
                {!user.approved && user.role !== 'admin' && (
                  <button
                    onClick={() => onApproveUser(user.id)}
                    className="btn btn-sm btn-primary"
                  >
                    Approve
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default UserTable;