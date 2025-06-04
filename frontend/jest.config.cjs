module.exports = {
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },
  transform: {
    '^.+\\.[tj]sx?$': 'babel-jest'
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};
