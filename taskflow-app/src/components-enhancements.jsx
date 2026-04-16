/* ========================================
   TASKFLOW COMPONENT ENHANCEMENTS - Senior UI/UX Designer
   Logic-preserving visual improvements for existing components
   ======================================== */

// ===== UTILITY FUNCTIONS (REQUIRED FOR COMPONENTS) =====

/**
 * Get Tailwind CSS classes for task status badges
 * @param {string} status - Task status
 * @returns {string} Tailwind CSS classes
 */
export function getStatusBadgeClass(status) {
  const statusClasses = {
    'Pending': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'In Progress': 'bg-blue-100 text-blue-800 border-blue-200',
    'Completed': 'bg-green-100 text-green-800 border-green-200',
    'Done': 'bg-green-100 text-green-800 border-green-200',
    'Cancelled': 'bg-red-100 text-red-800 border-red-200',
    'Deferred': 'bg-gray-100 text-gray-800 border-gray-200',
    'Assigned': 'bg-purple-100 text-purple-800 border-purple-200',
    'Forwarded': 'bg-indigo-100 text-indigo-800 border-indigo-200',
    'Dispatch Pending': 'bg-orange-100 text-orange-800 border-orange-200',
    'Dispatched': 'bg-teal-100 text-teal-800 border-teal-200'
  };
  return statusClasses[status] || 'bg-gray-100 text-gray-800 border-gray-200';
}

/**
 * Get Tailwind CSS classes for priority badges
 * @param {string} priority - Task priority
 * @returns {string} Tailwind CSS classes
 */
export function getPriorityClass(priority) {
  const priorityClasses = {
    'Critical': 'bg-red-100 text-red-800 border-red-200',
    'High': 'bg-orange-100 text-orange-800 border-orange-200',
    'Medium': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'Normal': 'bg-blue-100 text-blue-800 border-blue-200',
    'Low': 'bg-green-100 text-green-800 border-green-200'
  };
  return priorityClasses[priority] || 'bg-gray-100 text-gray-800 border-gray-200';
}

// Enhanced Card Component - Apply to all existing cards
export const enhanceCard = (baseClasses = '') => {
  return `${baseClasses} card-enhanced hover-lift`.trim();
};

// Enhanced Button Component - Apply to all existing buttons
export const enhanceButton = (baseClasses = '') => {
  return `${baseClasses} btn-enhanced focus-ring`.trim();
};

// Enhanced Input Component - Apply to all existing inputs
export const enhanceInput = (baseClasses = '') => {
  return `${baseClasses} input-enhanced focus-ring`.trim();
};

// Enhanced Badge Component - Apply to all existing badges
export const enhanceBadge = (baseClasses = '') => {
  return `${baseClasses} badge-enhanced`.trim();
};

// Enhanced Modal Component - Apply to all existing modals
export const enhanceModal = (baseClasses = '') => {
  return `${baseClasses} modal-enhanced`.trim();
};

// Enhanced Status Indicators for Task Status
export const enhanceStatusBadge = (status) => {
  const baseClasses = getStatusBadgeClass(status);
  return `${baseClasses} badge-enhanced status-pulse`.trim();
};

// Enhanced Priority Indicators
export const enhancePriorityBadge = (priority) => {
  const baseClasses = getPriorityClass(priority);
  return `${baseClasses} badge-enhanced`.trim();
};

// Enhanced Loading States
export const LoadingSkeleton = ({ width = '100%', height = '1rem', className = '' }) => (
  <div 
    className={`loading-skeleton ${className}`}
    style={{ width, height }}
  />
);

// Enhanced Hover Effects for Interactive Elements
export const enhanceInteractive = (baseClasses = '') => {
  return `${baseClasses} hover-lift focus-ring`.trim();
};

// Enhanced Form Container
export const EnhancedFormContainer = ({ children, className = '' }) => (
  <div className={`card-enhanced p-6 md:p-8 ${className}`}>
    {children}
  </div>
);

// Enhanced Section Headers
export const EnhancedSectionHeader = ({ title, subtitle, className = '' }) => (
  <div className={`mb-6 ${className}`}>
    <h2 className="text-xl-fluid font-bold text-green-900 mb-2">{title}</h2>
    {subtitle && <p className="text-sm-fluid text-slate-600">{subtitle}</p>}
  </div>
);

// Enhanced Task Card Component
export const EnhancedTaskCard = ({ task, children, className = '' }) => {
  const statusClass = enhanceStatusBadge(task.Status);
  const priorityClass = enhancePriorityBadge(task.Priority);
  
  return (
    <div className={`card-enhanced p-4 md:p-6 ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-base-fluid font-semibold text-slate-900 truncate mb-2">
            {task.Title}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={statusClass}>{task.Status}</span>
            {task.Priority && <span className={priorityClass}>{task.Priority}</span>}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
};

// Enhanced Navigation Item
export const EnhancedNavItem = ({ active, children, ...props }) => {
  const baseClasses = "nav-item";
  const enhancedClasses = enhanceInteractive(baseClasses);
  
  return (
    <button 
      className={`${enhancedClasses} ${active ? 'active' : ''}`}
      {...props}
    >
      {children}
    </button>
  );
};

// Enhanced Table Row
export const EnhancedTableRow = ({ children, className = '' }) => (
  <tr className={`hover:bg-green-50/50 transition-colors duration-200 ${className}`}>
    {children}
  </tr>
);

// Enhanced Notification Item
export const EnhancedNotificationItem = ({ notification, children, className = '' }) => (
  <div className={`card-enhanced p-4 mb-3 hover-lift ${className}`}>
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-green-500 status-pulse"></div>
      </div>
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  </div>
);

// Enhanced Profile Avatar
export const EnhancedAvatar = ({ name, size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg'
  };
  
  return (
    <div className={`${sizeClasses[size]} rounded-xl flex items-center justify-center text-white font-bold bg-gradient-to-br from-green-600 to-green-700 shadow-lg hover-lift ${className}`}>
      {name?.charAt(0)?.toUpperCase() || '?'}
    </div>
  );
};

// Enhanced Search Input
export const EnhancedSearchInput = ({ value, onChange, placeholder = 'Search...', className = '' }) => (
  <div className={`relative ${className}`}>
    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
      <i className="bi bi-search"></i>
    </div>
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`input-enhanced pl-10 pr-4 ${className}`}
    />
  </div>
);

// Enhanced File Upload Area
export const EnhancedFileUploadArea = ({ children, onDrop, className = '' }) => (
  <div 
    className={`card-enhanced border-2 border-dashed border-green-300 hover:border-green-500 transition-colors duration-200 p-8 text-center ${className}`}
    onDrop={onDrop}
  >
    {children}
  </div>
);

// Enhanced Chat Bubble
export const EnhancedChatBubble = ({ message, isOwn = false, className = '' }) => {
  const baseClasses = isOwn ? 'bubble-own' : 'bubble-theirs';
  return (
    <div className={`${baseClasses} ${className}`}>
      {message}
    </div>
  );
};

// Enhanced Progress Bar
export const EnhancedProgressBar = ({ progress, className = '' }) => (
  <div className={`w-full bg-green-100 rounded-full h-2 overflow-hidden ${className}`}>
    <div 
      className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all duration-500 ease-out"
      style={{ width: `${progress}%` }}
    />
  </div>
);

// Enhanced Status Toggle
export const EnhancedStatusToggle = ({ status, onChange, options, className = '' }) => (
  <div className={`flex gap-2 p-1 bg-green-50 rounded-xl ${className}`}>
    {options.map(option => (
      <button
        key={option.value}
        onClick={() => onChange(option.value)}
        className={`px-3 py-1.5 rounded-lg text-xs-fluid font-medium transition-all duration-200 ${
          status === option.value
            ? 'bg-green-600 text-white shadow-md'
            : 'text-green-700 hover:bg-green-100'
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

// Enhanced Sidebar Component Wrapper
export const EnhancedSidebar = ({ children, isOpen, className = '' }) => (
  <aside className={`sidebar-modern ${isOpen ? 'open' : ''} bg-white/95 backdrop-blur-sm border-r border-green-100 ${className}`}>
    {children}
  </aside>
);

// Enhanced Header Component Wrapper
export const EnhancedHeader = ({ children, className = '' }) => (
  <header className={`bg-gradient-to-r from-green-900 to-green-800 border-b border-green-700 sticky top-0 z-40 backdrop-blur-sm ${className}`}>
    {children}
  </header>
);

// Enhanced Loading Spinner
export const EnhancedLoadingSpinner = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12'
  };
  
  return (
    <div className={`${sizeClasses[size]} border-2 border-green-200 border-t-green-600 rounded-full animate-spin ${className}`} />
  );
};

// Enhanced Empty State
export const EnhancedEmptyState = ({ icon, title, description, action, className = '' }) => (
  <div className={`text-center py-12 px-6 ${className}`}>
    <div className="w-16 h-16 mx-auto mb-4 text-green-200">
      <i className={`bi bi-${icon} text-4xl`}></i>
    </div>
    <h3 className="text-lg-fluid font-semibold text-slate-900 mb-2">{title}</h3>
    <p className="text-sm-fluid text-slate-600 mb-6">{description}</p>
    {action}
  </div>
);

// Enhanced Success/Error States
export const EnhancedAlert = ({ type, title, message, className = '' }) => {
  const typeClasses = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };
  
  const icons = {
    success: 'bi-check-circle-fill',
    error: 'bi-exclamation-triangle-fill',
    warning: 'bi-exclamation-triangle-fill',
    info: 'bi-info-circle-fill'
  };
  
  return (
    <div className={`card-enhanced p-4 ${typeClasses[type]} ${className}`}>
      <div className="flex items-start gap-3">
        <i className={`bi ${icons[type]} flex-shrink-0 mt-0.5`}></i>
        <div>
          <h4 className="font-semibold mb-1">{title}</h4>
          <p className="text-sm">{message}</p>
        </div>
      </div>
    </div>
  );
};

// Enhanced Dropdown Menu
export const EnhancedDropdown = ({ children, className = '' }) => (
  <div className={`card-enhanced p-2 shadow-xl border border-green-100 ${className}`}>
    {children}
  </div>
);

// Enhanced Tooltip (CSS-based)
export const EnhancedTooltip = ({ content, children, className = '' }) => (
  <div className={`relative group ${className}`}>
    {children}
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50">
      {content}
      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900"></div>
    </div>
  </div>
);
