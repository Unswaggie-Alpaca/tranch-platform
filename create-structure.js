// create-structure.js - Cross-platform Node.js script
const fs = require('fs');
const path = require('path');

// Base directory
const baseDir = path.join('frontend', 'src');

// Directory structure
const structure = {
  components: {
    common: [
      'index.js',
      'LoadingSpinner.jsx',
      'ErrorMessage.jsx',
      'SuccessMessage.jsx',
      'InfoMessage.jsx',
      'Toast.jsx',
      'Tooltip.jsx',
      'Modal.jsx',
      'ConfirmationDialog.jsx',
      'NumberInput.jsx',
      'ProgressBar.jsx',
      'Tabs.jsx',
      'EmptyState.jsx',
      'StatusBadge.jsx'
    ],
    layout: [
      'index.js',
      'Navigation.jsx',
      'AppLayout.jsx',
      'ProtectedRoute.jsx'
    ],
    projects: ['index.js'],
    payments: ['index.js'],
    ai: ['index.js'],
    deal: ['index.js'],
    documents: ['index.js']
  },
  pages: {
    auth: ['index.js'],
    dashboard: ['index.js'],
    messages: ['index.js'],
    portfolio: ['index.js'],
    profile: ['index.js'],
    admin: ['index.js'],
    landing: ['index.js'],
    legal: ['index.js']
  },
  contexts: [
    'index.js',
    'AppContext.jsx',
    'NotificationContext.jsx'
  ],
  hooks: [
    'index.js',
    'useApi.js',
    'useDebounce.js'
  ],
  services: {
    api: [
      'index.js',
      'apiClient.js'
    ],
    _files: [
      'config.js',
      'stripe.js'
    ]
  },
  utils: [
    'index.js',
    'constants.js',
    'formatters.js',
    'validators.js',
    'helpers.js'
  ],
  styles: {
    base: [
      '_reset.css',
      '_variables.css',
      '_typography.css',
      '_utilities.css'
    ],
    components: [
      '_common.css',
      '_navigation.css',
      '_modal.css',
      '_forms.css',
      '_buttons.css',
      '_cards.css'
    ],
    pages: [
      '_dashboard.css',
      '_projects.css',
      '_messages.css',
      '_admin.css',
      '_auth.css',
      '_landing.css'
    ],
    _files: ['main.css']
  }
};

// Function to create directory recursively
function createDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
}

// Function to create file
function createFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '');
    console.log(`📄 Created file: ${filePath}`);
  }
}

// Function to process the structure
function processStructure(obj, currentPath = baseDir) {
  Object.entries(obj).forEach(([key, value]) => {
    if (key === '_files') {
      // Create files in current directory
      value.forEach(file => {
        createFile(path.join(currentPath, file));
      });
    } else if (Array.isArray(value)) {
      // Create directory and files
      const dirPath = path.join(currentPath, key);
      createDir(dirPath);
      value.forEach(file => {
        createFile(path.join(dirPath, file));
      });
    } else if (typeof value === 'object') {
      // Create directory and recurse
      const dirPath = path.join(currentPath, key);
      createDir(dirPath);
      processStructure(value, dirPath);
    }
  });
}

// Create base directory if it doesn't exist
createDir(baseDir);

// Process the structure
console.log('🚀 Creating folder structure...\n');
processStructure(structure);

console.log('\n✅ Folder structure created successfully!');
console.log(`\n📍 Location: ${path.resolve(baseDir)}`);

// Show tree-like structure
console.log('\n📁 Created structure:');
console.log(`
frontend/src/
├── components/
│   ├── common/
│   ├── layout/
│   ├── projects/
│   ├── payments/
│   ├── ai/
│   ├── deal/
│   └── documents/
├── pages/
│   ├── auth/
│   ├── dashboard/
│   ├── messages/
│   ├── portfolio/
│   ├── profile/
│   ├── admin/
│   ├── landing/
│   └── legal/
├── contexts/
├── hooks/
├── services/
│   └── api/
├── utils/
└── styles/
    ├── base/
    ├── components/
    └── pages/
`);